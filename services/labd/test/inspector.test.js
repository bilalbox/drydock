import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { createInspectorHandler } from "../src/inspector.js";

let upstreamServer;
let gateServer;
let gateBase;
const upstreamRequests = [];

before(async () => {
  upstreamServer = http.createServer((req, res) => {
    upstreamRequests.push({ method: req.method, url: req.url });
    if (req.url === "/") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'self'",
      });
      res.end("<html><head><title>Floci</title></head><body>ok</body></html>");
      return;
    }
    if (req.url === "/assets/index-abc.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end("console.log('asset');");
      return;
    }
    if (req.url === "/api/clouds/aws/services/storage/schema") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          actions: ["list", "create", "delete", "inspect"],
          capabilities: {
            resourceActions: [
              { name: "list", enabled: true },
              { name: "create", enabled: true },
              { name: "emptyBucket", enabled: true },
            ],
            objectActions: [
              { name: "download", enabled: true },
              { name: "upload", enabled: true },
              { name: "delete", enabled: true },
            ],
          },
        }),
      );
      return;
    }
    if (req.url === "/api/clouds/aws/services/logs/query" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ rows: [] }));
      return;
    }
    if (req.url === "/api/clouds/aws/services/storage/resources/id/key-query" && req.method === "POST") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ items: [] }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ url: req.url }));
  });
  await new Promise((resolve) => upstreamServer.listen(0, "127.0.0.1", resolve));
  const upstreamPort = upstreamServer.address().port;

  const inspector = createInspectorHandler({ origin: `http://127.0.0.1:${upstreamPort}` });
  gateServer = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (inspector.matches(url.pathname)) {
      inspector.handle(req, res, url);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => gateServer.listen(0, "127.0.0.1", resolve));
  gateBase = `http://127.0.0.1:${gateServer.address().port}`;
});

after(async () => {
  await new Promise((resolve) => gateServer.close(resolve));
  await new Promise((resolve) => upstreamServer.close(resolve));
});

test("boot script is served locally without hitting upstream", async () => {
  const beforeCount = upstreamRequests.length;
  const response = await fetch(`${gateBase}/inspector-boot.js`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(await response.text(), /history\.replaceState/);
  assert.equal(upstreamRequests.length, beforeCount);
});

test("document navigation strips /inspector prefix, loads root shell, strips CSP, and injects boot script", async () => {
  const response = await fetch(`${gateBase}/inspector/cloud-explorer/aws/storage`, {
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), null);
  assert.match(await response.text(), /<head><script src="\/inspector-boot\.js"><\/script>/);
  assert.deepEqual(upstreamRequests.at(-1), { method: "GET", url: "/" });
});

test("assets pass through untouched", async () => {
  const response = await fetch(`${gateBase}/assets/index-abc.js`, {
    headers: { accept: "text/html,application/xhtml+xml" },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "console.log('asset');");
  assert.deepEqual(upstreamRequests.at(-1), { method: "GET", url: "/assets/index-abc.js" });
});

test("schema responses strip mutation actions and capabilities", async () => {
  const response = await fetch(`${gateBase}/inspector/api/clouds/aws/services/storage/schema`);
  assert.equal(response.status, 200);
  const schema = await response.json();
  assert.deepEqual(schema.actions, ["list", "inspect"]);
  assert.deepEqual(schema.capabilities.resourceActions.map((item) => item.name), ["list"]);
  assert.deepEqual(schema.capabilities.objectActions.map((item) => item.name), ["download"]);
});

test("read queries succeed and write methods are refused with 403", async () => {
  const query = await fetch(`${gateBase}/api/clouds/aws/services/logs/query`, { method: "POST" });
  assert.equal(query.status, 200);

  const keyQuery = await fetch(`${gateBase}/api/clouds/aws/services/storage/resources/id/key-query`, { method: "POST" });
  assert.equal(keyQuery.status, 200);

  for (const [method, path] of [
    ["POST", "/inspector/api/clouds/aws/services/storage/resources"],
    ["DELETE", "/api/clouds/aws/services/storage/resources/bucket"],
    ["PUT", "/api/clouds/aws/services/storage/resources/bucket/object"],
    ["POST", "/api/clouds/aws/services/storage/resources/bucket/empty"],
  ]) {
    const denied = await fetch(`${gateBase}${path}`, { method });
    assert.equal(denied.status, 403);
    assert.match((await denied.json()).error, /read-only/);
  }
});

test("unreachable upstream returns 502", async () => {
  const broken = createInspectorHandler({ origin: "http://127.0.0.1:1" });
  const srv = http.createServer((req, res) => broken.handle(req, res));
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${srv.address().port}/inspector/cloud-explorer/aws/storage`);
    assert.equal(response.status, 502);
    assert.match(await response.text(), /Inspector is unavailable/);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});
