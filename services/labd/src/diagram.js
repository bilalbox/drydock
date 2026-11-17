import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { renderDiagram } from "../../diagrams/src/render.ts";

/** Cache only rendered output. Always refresh plans so remote drift and edited files are observed. */
export function createDiagramRenderer() {
  let cached;
  return async (session, mode, run) => {
    const opts = { cwd: session.workspace, env: session.env };
    const planfile = path.join(session.workspace, ".drydock", `diagram-${randomUUID()}.tfplan`);
    async function command(argv) {
      const result = await run(argv, opts);
      if (result.exitCode !== 0) throw new Error("Terraform could not produce the diagram. Check the workspace in the Terminal.");
      return result.stdout;
    }
    try {
      if (mode === "plan") await command(["terraform", "plan", "-refresh=true", "-lock=false", "-input=false", "-no-color", `-out=${planfile}`]);
      const json = await command(["terraform", "show", "-json", ...(mode === "plan" ? [planfile] : [])]);
      const hash = createHash("sha256").update(json).digest("hex");
      const key = `${session.workspace}:${mode}:${hash}`;
      if (cached?.key === key) return cached.svg;
      let svg;
      try { svg = await renderDiagram(JSON.parse(json)); }
      catch { throw new Error("Terraform returned an unsupported diagram. Check the workspace in the Terminal."); }
      cached = { key, svg };
      return svg;
    } finally {
      // The path is generated here and stays inside the active workspace; plans can contain secrets.
      if (mode === "plan") await fs.unlink(planfile).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
  };
}
