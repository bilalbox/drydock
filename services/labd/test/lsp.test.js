import assert from "node:assert/strict";
import { once } from "node:events";
import { EventEmitter } from "node:events";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bridgeWebSocketToCommand, injectWorkspaceRoot } from "../src/terraformLsp.js";

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.readyState = 1;
    this.OPEN = 1;
    this.CONNECTING = 0;
  }

  send(data) {
    this.sent.push(String(data));
  }

  close() {
    this.readyState = 3;
    this.emit("close", 1000, Buffer.from(""));
  }
}

function waitFor(predicate, timeout = 2000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error("timed out"));
      setTimeout(tick, 20);
    };
    tick();
  });
}

test("initialize uses the workspace root when the client does not send one", () => {
  const message = { method: "initialize", params: { rootUri: null, capabilities: {} } };
  injectWorkspaceRoot(message, "/workspaces/lab");
  assert.equal(message.params.rootUri, "file:///workspaces/lab");
  assert.equal(message.params.rootPath, "/workspaces/lab");
  assert.deepEqual(message.params.workspaceFolders, [{ name: "workspace", uri: "file:///workspaces/lab" }]);
  const named = { method: "initialize", params: { rootUri: "file:///keep" } };
  injectWorkspaceRoot(named, "/workspaces/lab");
  assert.equal(named.params.rootUri, "file:///keep");
});

test("the terraform bridge speaks JSON-RPC over the socket and kills the child on close", { timeout: 5000 }, async () => {
  const socket = new FakeSocket();
  const helper = path.join(path.dirname(fileURLToPath(import.meta.url)), "fake-ls.js");
  const child = bridgeWebSocketToCommand(socket, {
    command: process.execPath,
    args: [helper],
    cwd: process.cwd(),
  });
  socket.emit("message", JSON.stringify({
    jsonrpc: "2.0",
    id: 7,
    method: "initialize",
    params: { rootUri: "file:///workspace" },
  }));
  await waitFor(() => socket.sent.length > 0);
  const response = JSON.parse(socket.sent[0]);
  assert.equal(response.id, 7);
  assert.equal(response.result.capabilities.completionProvider, true);
  assert.equal(response.result.rootUri, "file:///workspace");
  socket.close();
  const [code, signal] = await once(child, "exit");
  assert.ok(signal === "SIGTERM" || code === 0);
});
