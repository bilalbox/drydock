import fs from "node:fs";
import path from "node:path";
import { materializeBundles } from "./bundles/index.js";
import { shellQuote } from "./bundles/common.js";

export function materializeWorkspace({ lab, dest, lock }) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(lab.starterDir, dest, { recursive: true });
  const { files, env, prepare } = materializeBundles(lab, dest, lock);
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(dest, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  const drydock = path.join(dest, ".drydock");
  fs.mkdirSync(drydock, { recursive: true });
  const exports = Object.entries(env)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join("\n");
  fs.writeFileSync(path.join(drydock, "env"), `${exports}\n`);
  fs.writeFileSync(
    path.join(drydock, "docker.env"),
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
  );
  fs.writeFileSync(
    path.join(dest, ".bashrc"),
    `if [ -f "$HOME/.drydock/env" ]; then
  set -a
  . "$HOME/.drydock/env"
  set +a
fi
cd "$HOME"
PS1='drydock:\\w\\$ '
`,
  );
  return { env, prepare };
}
