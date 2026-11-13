import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { getLab, loadCatalog } from "../src/catalog.js";
import { createLabdServer } from "../src/server.js";
import { createSessionManager } from "../src/session.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const catalog = loadCatalog(path.join(root, "content"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "providers.lock.json"), "utf8"));
const guidedLabId = "artifact-storage/northline/private-artifact-bucket";
const challengeLabId = "artifact-storage/northline/expire-old-builds";

function makeFakeEmulators() {
  const calls = [];
  return {
    calls,
    cloudNames: () => ["aws", "azure", "gcp", "oci"],
    stopClouds: async (clouds) => calls.push(["stop", clouds]),
    ensureClouds: async (clouds) => calls.push(["ensure", clouds]),
    resetCloud: async (cloud) => calls.push(["reset", cloud]),
  };
}

test("session startup prunes stale workspaces, and open/reset remove superseded workspaces and record progress", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "drydock-session-"));
  const workspacesDir = path.join(tmp, "workspaces");
  const progressPath = path.join(tmp, "progress.json");
  const staleDir = path.join(workspacesDir, "stale-uuid");
  fs.mkdirSync(staleDir, { recursive: true });
  fs.writeFileSync(path.join(staleDir, "leftover.tf"), "# stale\n");

  const emulators = makeFakeEmulators();
  const toolboxCalls = [];
  const session = createSessionManager({
    workspacesDir,
    progressPath,
    checksDir: "/opt/drydock/checks",
    lock,
    emulators,
    toolbox: {
      run: async (argv, opts) => {
        toolboxCalls.push({ argv, opts });
        if (argv[2] === "get-bucket-versioning") {
          return { exitCode: 0, stdout: JSON.stringify({ Status: "Enabled" }), stderr: "" };
        }
        if (argv[2] === "get-public-access-block") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                IgnorePublicAcls: true,
                BlockPublicPolicy: true,
                RestrictPublicBuckets: true,
              },
            }),
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      attachTerminal: async () => {},
    },
    lsp: { attach: () => {} },
  });

  assert.equal(fs.existsSync(staleDir), false);
  assert.deepEqual(session.progress(), {});

  const { lab: guided } = getLab(catalog, guidedLabId);
  const first = await session.open(guided);
  const firstWs = path.join(workspacesDir, first.id);
  assert.equal(fs.existsSync(firstWs), true);
  assert.equal(session.progress()[guidedLabId].status, "in_progress");
  assert.deepEqual(emulators.calls, [
    ["stop", ["azure", "gcp", "oci"]],
    ["ensure", ["aws"]],
    ["reset", "aws"],
  ]);
  assert.deepEqual(toolboxCalls[0].argv, ["terraform", "init", "-input=false", "-no-color"]);

  const attempt = await session.grade();
  assert.equal(attempt.passed, true);
  assert.equal(session.progress()[guidedLabId].status, "passed");
  assert.equal(session.progress()[guidedLabId].attempts, 1);

  const reset = await session.reset();
  assert.notEqual(reset.id, first.id);
  assert.equal(fs.existsSync(firstWs), false);
  assert.equal(fs.existsSync(path.join(workspacesDir, reset.id)), true);

  const { lab: challenge } = getLab(catalog, challengeLabId);
  const second = await session.open(challenge);
  assert.equal(fs.existsSync(path.join(workspacesDir, reset.id)), false);
  assert.equal(fs.existsSync(path.join(workspacesDir, second.id)), true);
  session.close();
  assert.equal(fs.existsSync(path.join(workspacesDir, second.id)), false);
});

test("failed open cleans up partially created workspace and keeps no active session", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "drydock-fail-"));
  const workspacesDir = path.join(tmp, "workspaces");
  const session = createSessionManager({
    workspacesDir,
    progressPath: path.join(tmp, "progress.json"),
    lock,
    emulators: makeFakeEmulators(),
    toolbox: {
      run: async () => ({ exitCode: 1, stdout: "", stderr: "init exploded" }),
      attachTerminal: async () => {},
    },
    lsp: { attach: () => {} },
  });

  const { lab } = getLab(catalog, guidedLabId);
  await assert.rejects(() => session.open(lab), /init exploded/);
  assert.equal(session.current(), null);
  assert.deepEqual(fs.readdirSync(workspacesDir), []);
});

test("labd server exposes HTTP/WS endpoints, enforces sessionId on writes, and closes stale WebSockets on new session", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "drydock-srv-"));
  const workspacesDir = path.join(tmp, "workspaces");
  const webDir = path.join(tmp, "web");
  fs.mkdirSync(webDir, { recursive: true });
  fs.writeFileSync(path.join(webDir, "index.html"), "<!doctype html><h1>Drydock</h1>");

  const session = createSessionManager({
    workspacesDir,
    progressPath: path.join(tmp, "progress.json"),
    checksDir: "/opt/drydock/checks",
    lock,
    emulators: makeFakeEmulators(),
    toolbox: {
      run: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      attachTerminal: async (ws) => {
        ws.send(JSON.stringify({ t: "o", d: "ready" }));
      },
    },
    lsp: {
      attach: (ws) => {
        ws.send("lsp-ready");
      },
    },
  });

  const { server, close } = createLabdServer({
    catalog,
    lock,
    webDir,
    session,
    inspector: { matches: () => false, handle: () => {} },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const noFiles = await fetch(`${base}/api/sessions/current/files`);
    assert.equal(noFiles.status, 409);

    const openRes = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ labId: guidedLabId }),
    });
    assert.equal(openRes.status, 201);
    const opened = await openRes.json();

    const filesRes = await fetch(`${base}/api/sessions/current/files`);
    assert.equal(filesRes.status, 200);
    const filesBody = await filesRes.json();
    assert.deepEqual(
      filesBody.files.map((item) => item.name),
      ["main.tf", "provider.tf"],
    );

    const roWrite = await fetch(`${base}/api/sessions/current/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: opened.id, path: "provider.tf", text: "hack" }),
    });
    assert.equal(roWrite.status, 403);

    const staleWrite = await fetch(`${base}/api/sessions/current/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "old-id", path: "main.tf", text: "hack" }),
    });
    assert.equal(staleWrite.status, 409);

    const termWs = new WebSocket(`ws://127.0.0.1:${port}/term`);
    const lspWs = new WebSocket(`ws://127.0.0.1:${port}/lsp/terraform`);
    await Promise.all([
      new Promise((resolve) => termWs.once("message", resolve)),
      new Promise((resolve) => lspWs.once("message", resolve)),
    ]);

    const termClosed = new Promise((resolve) => termWs.once("close", (code) => resolve(code)));
    const lspClosed = new Promise((resolve) => lspWs.once("close", (code) => resolve(code)));

    const replaceRes = await fetch(`${base}/api/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ labId: challengeLabId }),
    });
    assert.equal(replaceRes.status, 201);

    assert.equal(await termClosed, 4000);
    assert.equal(await lspClosed, 4000);

    const staticRes = await fetch(`${base}/`);
    assert.equal(staticRes.status, 200);
    assert.match(await staticRes.text(), /Drydock/);
  } finally {
    await close();
  }
});
