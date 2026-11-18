import type { DiagramEdge, DiagramModel, DiagramNode } from "./model.ts";
import { vendorOf } from "./parse.ts";

export interface ConfigFile {
  /** Workspace-relative path, used for locations. */
  path: string;
  text: string;
}

interface Block {
  kind: "resource" | "data" | "module";
  type: string;
  name: string;
  /** Body text with comments blanked; strings and interpolations kept. */
  body: string;
  location: string;
}

/**
 * Builds a diagram model straight from Terraform configuration text.
 * No Terraform binary, state or provider schema is involved, so the
 * diagram follows the learner's files as they type and save.
 */
export function buildConfigModel(files: ConfigFile[]): DiagramModel {
  const blocks = files.filter(file => file.path.endsWith(".tf")).flatMap(file => scanBlocks(file));
  const nodes = new Map<string, DiagramNode>();
  const resourceTypes = new Set<string>();
  for (const block of blocks) {
    if (block.kind === "data") continue;
    const address = block.kind === "module" ? `module.${block.name}` : `${block.type}.${block.name}`;
    if (block.kind === "resource") resourceTypes.add(block.type);
    nodes.set(address, {
      address, type: block.type, name: block.name, vendor: block.kind === "module" ? "other" : vendorOf(block.type),
      action: "none", drifted: false, changes: [], driftChanges: [], location: block.location,
    });
  }
  const edges: DiagramEdge[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (block.kind === "data") continue;
    const from = block.kind === "module" ? `module.${block.name}` : `${block.type}.${block.name}`;
    for (const match of block.body.matchAll(/(?<![\w.-])(module|[a-z][a-z0-9]*_[a-z0-9_]*)\.([A-Za-z_][\w-]*)/g)) {
      const [, head, name] = match;
      if (head !== "module" && !resourceTypes.has(head)) continue;
      const to = `${head}.${name}`;
      const key = `${from}\0${to}`;
      if (to === from || !nodes.has(to) || seen.has(key)) continue;
      seen.add(key);
      edges.push({ from, to });
    }
  }
  return { source: "config", nodes: [...nodes.values()], edges };
}

type Context = { kind: "code"; depth: number } | { kind: "string" } | { kind: "heredoc"; marker: string };

/** Finds top-level resource, data and module blocks, honoring comments, strings, interpolations and heredocs. */
export function scanBlocks(file: ConfigFile): Block[] {
  const src = file.text;
  // Same length as src, with comments replaced by spaces so offsets still line up.
  const code = src.split("");
  const stack: Context[] = [{ kind: "code", depth: 0 }];
  const blocks: Block[] = [];
  let headerStart = 0;
  let open: { header: string; at: number } | null = null;
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (code[k] !== "\n") code[k] = " ";
  };
  while (i < src.length) {
    const top = stack[stack.length - 1];
    const ch = src[i];
    const next = src[i + 1];
    if (top.kind === "string") {
      if (ch === "\\") { i += 2; continue; }
      if (ch === '"') { stack.pop(); i++; continue; }
      if ((ch === "$" || ch === "%") && next === "{") {
        if (src[i - 1] === ch) { i += 2; continue; } // $${ and %%{ are escapes
        stack.push({ kind: "code", depth: 0 }); i += 2; continue;
      }
      if (ch === "\n") { stack.pop(); i++; continue; } // unterminated string: recover at end of line
      i++; continue;
    }
    if (top.kind === "heredoc") {
      if (i === 0 || src[i - 1] === "\n") {
        const end = src.indexOf("\n", i);
        const line = src.slice(i, end === -1 ? src.length : end);
        if (line.trim() === top.marker) { stack.pop(); i += line.length; continue; }
      }
      if ((ch === "$" || ch === "%") && next === "{" && src[i - 1] !== ch) {
        stack.push({ kind: "code", depth: 0 }); i += 2; continue;
      }
      i++; continue;
    }
    // Code context.
    if (ch === "#" || (ch === "/" && next === "/")) {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop); i = stop; continue;
    }
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop); i = stop; continue;
    }
    if (ch === '"') { stack.push({ kind: "string" }); i++; continue; }
    if (ch === "<" && next === "<") {
      const heredoc = /^<<-?([A-Za-z_][\w-]*)[ \t]*\r?\n/.exec(src.slice(i, i + 80));
      if (heredoc) { stack.push({ kind: "heredoc", marker: heredoc[1] }); i += heredoc[0].length; continue; }
    }
    if (ch === "{") {
      if (stack.length === 1 && top.depth === 0) open = { header: code.slice(headerStart, i).join(""), at: i + 1 };
      top.depth++; i++; continue;
    }
    if (ch === "}") {
      if (top.depth === 0 && stack.length > 1) { stack.pop(); i++; continue; }
      top.depth = Math.max(0, top.depth - 1);
      if (stack.length === 1 && top.depth === 0) {
        if (open) {
          const block = toBlock(open.header, code.slice(open.at, i).join(""), file.path, lineOf(src, open.at));
          if (block) blocks.push(block);
          open = null;
        }
        headerStart = i + 1;
      }
      i++; continue;
    }
    i++;
  }
  return blocks;
}

function toBlock(header: string, body: string, path: string, line: number): Block | null {
  const location = `${path}:${line}`;
  const labelled = /(?:^|\n)\s*(resource|data)\s+"([^"]+)"\s+"([^"]+)"\s*$/.exec(header);
  if (labelled) return { kind: labelled[1] as "resource" | "data", type: labelled[2], name: labelled[3], body, location };
  const module = /(?:^|\n)\s*module\s+"([^"]+)"\s*$/.exec(header);
  if (module) return { kind: "module", type: "module", name: module[1], body, location };
  return null;
}

function lineOf(src: string, offset: number) {
  let line = 1;
  for (let k = 0; k < offset && k < src.length; k++) if (src[k] === "\n") line++;
  return line;
}
