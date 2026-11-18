import { createHash } from "node:crypto";
import { buildConfigModel } from "../../diagrams/src/hcl.ts";
import { renderModel } from "../../diagrams/src/render.ts";
import { listWorkspaceFiles, readWorkspaceFile } from "./workspace.js";

/**
 * Renders the root module's .tf files as an architecture diagram.
 * Reads configuration only, so it never runs Terraform and works before init or apply.
 */
export function createDiagramRenderer() {
  let cached;
  return async (session) => {
    const files = listWorkspaceFiles(session.workspace)
      .filter((node) => node.type === "file" && node.name.endsWith(".tf"))
      .map((node) => readWorkspaceFile(session.workspace, node.path));
    const hash = createHash("sha256");
    for (const file of files) hash.update(file.path).update("\0").update(file.text).update("\0");
    const key = `${session.workspace}:${hash.digest("hex")}`;
    if (cached?.key === key) return cached.svg;
    const svg = await renderModel(buildConfigModel(files));
    cached = { key, svg };
    return svg;
  };
}
