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
  let fail = false;
  const toolbox = { run: async (argv, opts) => {
    commands.push({ argv, opts });
    if (fail) return { exitCode: 1, stderr: "secret-credentials", stdout: "" };
    const fixture = argv.length > 3 ? "plan" : "state";
    return { exitCode: 0, stderr: "", stdout: argv[1] === "show" ? fs.readFileSync(path.join(root, `services/diagrams/test/fixtures/${fixture}.json`), "utf8") : "" };
  } };
  const session = createSessionManager({ lock, workspacesDir: path.join(dir, "workspaces"), progressPath: path.join(dir, "progress.json"), toolbox,
    emulators: { cloudNames: () => [], stopClouds: async () => {}, ensureClouds: async () => {}, resetCloud: async () => {} } });
  const app = createLabdServer({ session, catalog, lock });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { session, commands, fail: () => { fail = true; }, request: (query = "") => fetch(`http://127.0.0.1:${app.server.address().port}/api/diagram${query}`) };
}

test("diagram endpoint validates mode and requires an active workspace", async t => {
  const app = await setup(t);
  assert.equal((await app.request("?mode=bogus")).status, 400);
  assert.equal((await app.request()).status, 409);
});

test("diagram endpoint renders current state and refreshes plans in the active workspace", async t => {
  const app = await setup(t);
  const { lab } = getLab(catalog, "artifact-storage/northline/private-artifact-bucket");
  const session = await app.session.open(lab);
  const response = await app.request("?mode=state");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /image\/svg\+xml/);
  const svg = await response.text();
  assert.match(svg, /aws_s3_bucket.logs/);
  assert.equal(await (await app.request()).text(), svg);
  const plan = await app.request("?mode=plan");
  assert.equal(plan.status, 200);
  assert.match(await plan.text(), /data-action="replace"/);
  assert.ok(app.commands.every(command => command.opts.cwd.endsWith(session.id)));
  const planCommand = app.commands.find(command => command.argv[1] === "plan");
  for (const flag of ["-refresh=true", "-lock=false", "-input=false"]) assert.ok(planCommand.argv.includes(flag));
  app.fail();
  const failure = await app.request("?mode=plan");
  assert.equal(failure.status, 500);
  assert.doesNotMatch(await failure.text(), /secret-credentials/);
});
