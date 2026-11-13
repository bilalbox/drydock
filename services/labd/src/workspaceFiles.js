import fs from "node:fs";
import path from "node:path";
import { GENERATED_HEADER } from "./bundles/common.js";

const SKIP_DIRS = new Set([".terraform", ".drydock", ".aws", ".azure", ".git"]);
const MAX_BYTES = 1_000_000;

export function listWorkspace(root) {
  const rootReal = fs.realpathSync(root);
  return readDir(rootReal, rootReal);
}

export function readWorkspaceFile(root, relative) {
  const file = resolveWorkspacePath(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw httpError(404, "That file is not in the workspace.");
  }
  if (fs.statSync(file).size > MAX_BYTES) {
    throw httpError(413, "That file is too large to open here.");
  }
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("\0")) throw httpError(415, "That file is not text.");
  return {
    path: toPosix(path.relative(fs.realpathSync(root), file)),
    text,
    readOnly: isGenerated(text),
  };
}

export function writeWorkspaceFile(root, relative, text) {
  if (typeof text !== "string") throw httpError(400, "The editor did not send text.");
  if (text.length > MAX_BYTES) throw httpError(413, "That file is too large to save.");
  if (text.includes("\0")) throw httpError(400, "That file is not text.");
  const file = resolveWorkspacePath(root, relative);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const current = fs.readFileSync(file, "utf8");
    if (isGenerated(current)) {
      throw httpError(403, "This file is restored on reset. Edit main.tf.");
    }
  }
  fs.writeFileSync(file, text);
}

export function resolveWorkspacePath(root, relative) {
  if (typeof relative !== "string" || relative.length === 0 || relative.includes("\0")) {
    throw httpError(400, "Choose a file in the workspace.");
  }
  const rootReal = fs.realpathSync(root);
  const normalized = path.normalize(relative);
  const parts = normalized.split(path.sep).filter((part) => part && part !== ".");
  if (path.isAbsolute(normalized) || parts.includes("..")) {
    throw httpError(400, "That path is outside the workspace.");
  }
  if (parts.some((part) => SKIP_DIRS.has(part))) {
    throw httpError(404, "That file is not part of the lab workspace.");
  }
  const target = path.resolve(rootReal, ...parts);
  const parent = path.dirname(target);
  if (!fs.existsSync(parent)) throw httpError(404, "That file is not in the workspace.");
  const parentReal = fs.realpathSync(parent);
  const parentRel = path.relative(rootReal, parentReal);
  if (parentRel.startsWith("..") || path.isAbsolute(parentRel)) {
    throw httpError(400, "That path is outside the workspace.");
  }
  const resolved = path.join(parentReal, path.basename(target));
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    throw httpError(400, "That path is outside the workspace.");
  }
  return resolved;
}

function readDir(dir, rootReal) {
  const nodes = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = toPosix(path.relative(rootReal, full));
    if (entry.isDirectory()) {
      nodes.push({ name: entry.name, path: rel, type: "dir", children: readDir(full, rootReal) });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path: rel, type: "file" });
    }
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
  });
  return nodes;
}

function rank(name) {
  if (name === "main.tf") return 0;
  if (name.endsWith(".tf")) return 1;
  return 2;
}

function isGenerated(text) {
  return text.startsWith(GENERATED_HEADER);
}

function toPosix(relative) {
  return relative.split(path.sep).join("/");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
