import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createLabdServer } from "../src/server.js";
import { createSessionManager } from "../src/session.js";
import { getLab, loadCatalog } from "../src/catalog.js";

const root = path.resolve(import.meta.dirname, "../../..");
const catalog = loadCatalog(path.join(root, "content"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "providers.lock.json")));
async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drydock-diagram-"));
  const commands = [];
  const toolbox = { run: async (argv, opts) => { commands.push({ argv, opts }); return { exitCode: 0, stderr: "", stdout: "" }; } };
  const session = createSessionManager({ lock, workspacesDir: path.join(dir, "workspaces"), toolbox,
    emulators: { cloudNames: () => [], stopClouds: async () => {}, ensureClouds: async () => {}, resetCloud: async () => {} } });
  const app = createLabdServer({ session, catalog, lock });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { session, commands, request: () => fetch(`http://127.0.0.1:${app.server.address().port}/api/diagram`) };
}

test("diagram endpoint requires an active workspace", async t => {
  const app = await setup(t);
  assert.equal((await app.request()).status, 409);
});

test("diagram endpoint draws the workspace .tf files without running Terraform", async t => {
  const app = await setup(t);
  const { lab } = getLab(catalog, "artifact-storage/northline/private-artifact-bucket");
  await app.session.open(lab);
  const { workspaceRoot } = app.session.listFiles();
  const before = app.commands.length;
  const response = await app.request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /image\/svg\+xml/);
  const first = await response.text();
  assert.equal(await (await app.request()).text(), first);

  fs.writeFileSync(path.join(workspaceRoot, "extra.tf"), 'resource "aws_s3_bucket" "drawn_from_config" {}\n');
  const updated = await (await app.request()).text();
  assert.match(updated, /data-address="aws_s3_bucket.drawn_from_config"/);
  assert.match(updated, /extra.tf:1/);
  assert.equal(app.commands.length, before, "no toolbox commands for diagrams");
});
