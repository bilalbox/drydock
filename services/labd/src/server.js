import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer } from "ws";
import { getLab, loadCatalog, publicCatalog } from "./catalog.js";
import { loadProgress } from "./progress.js";
import { currentSession, gradeSession, openSession, publicSession, resetSession } from "./session.js";
import { attachTerminal } from "./toolbox.js";
import { attachTerraformLsp } from "./terraformLsp.js";
import { listWorkspace, readWorkspaceFile, writeWorkspaceFile } from "./workspaceFiles.js";

const PORT = Number(process.env.PORT ?? 8080);
const CONTENT_DIR = process.env.CONTENT_DIR ?? path.resolve("content");
const LOCK_PATH = process.env.LOCK_PATH ?? path.resolve("providers.lock.json");
const WEB_DIR = process.env.WEB_DIR ?? path.resolve("web");
const PROGRESS_PATH = process.env.PROGRESS_PATH ?? path.resolve("data/progress.json");
const INSPECTOR_ORIGIN = process.env.INSPECTOR_ORIGIN ?? "http://127.0.0.1:4502";

const INSPECTOR_PREFIXES = [
  "/inspector",
  "/cloud-explorer",
  "/console",
  "/dashboard",
  "/settings",
  "/secretsmanager",
  "/assets",
  "/api/clouds",
  "/favicon.ico",
];

const BOOT_SCRIPT = `(() => {
  const prefix = "/inspector";
  const path = location.pathname;
  if (path === prefix || path.startsWith(prefix + "/")) {
    let next = path.slice(prefix.length) || "/";
    if (!next.startsWith("/")) next = "/" + next;
    history.replaceState(null, "", next + location.search + location.hash);
  }
})();
`;

const catalog = loadCatalog(CONTENT_DIR);
const lock = JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { status: "ok" });
    }
    if (req.method === "GET" && url.pathname === "/api/catalog") {
      return sendJson(res, 200, publicCatalog(catalog));
    }
    if (req.method === "GET" && url.pathname === "/api/progress") {
      return sendJson(res, 200, loadProgress(PROGRESS_PATH));
    }
    if (req.method === "GET" && url.pathname === "/api/sessions/current") {
      const session = currentSession();
      return sendJson(res, 200, session ? publicSession(session) : null);
    }
    if (req.method === "POST" && url.pathname === "/api/sessions") {
      const body = await readJson(req);
      const found = getLab(catalog, body.labId);
      if (!found) return sendJson(res, 404, { error: "Unknown lab" });
      const session = await openSession({ lab: found.lab, lock, progressFile: PROGRESS_PATH });
      return sendJson(res, 201, session);
    }
    if (req.method === "POST" && url.pathname === "/api/sessions/current/reset") {
      const session = await resetSession({ lock, progressFile: PROGRESS_PATH });
      return sendJson(res, 200, session);
    }
    if (req.method === "POST" && url.pathname === "/api/sessions/current/check") {
      const attempt = await gradeSession(PROGRESS_PATH);
      return sendJson(res, 200, attempt);
    }
    if (url.pathname === "/api/sessions/current/files" || url.pathname === "/api/sessions/current/file") {
      return await handleWorkspaceFile(req, res, url);
    }
    if (req.method === "GET" && url.pathname === "/inspector-boot.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(BOOT_SCRIPT);
      return;
    }
    if (isInspectorPath(url.pathname)) {
      proxy(req, res, INSPECTOR_ORIGIN);
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      if (serveStatic(url.pathname, req, res)) return;
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[drydock]", message);
    if (!res.headersSent) sendJson(res, 500, { error: message });
  }
});

const sockets = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/lsp/terraform") {
    sockets.handleUpgrade(req, socket, head, (ws) => {
      const session = currentSession();
      if (!session) {
        ws.close(4409, "No lab is open");
        return;
      }
      try {
        attachTerraformLsp(ws, session.workspace);
      } catch (error) {
        console.error("[terraform-ls]", error instanceof Error ? error.message : error);
        ws.close();
      }
    });
    return;
  }
  if (url.pathname !== "/term") {
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(req, socket, head, (ws) => {
    const session = currentSession();
    if (!session) {
      ws.send(JSON.stringify({ t: "e", d: "Start a lab before using the terminal." }));
      ws.close();
      return;
    }
    attachTerminal(ws, { cwd: session.workspace, env: session.env }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: "e", d: message }));
      ws.close();
    });
  });
});

server.requestTimeout = 600_000;
server.listen(PORT, () => {
  console.log(`drydock listening on ${PORT}`);
});

function isInspectorPath(pathname) {
  return INSPECTOR_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function serveStatic(pathname, req, res) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (relative.includes("\0")) return false;
  const file = path.resolve(WEB_DIR, relative);
  if (!file.startsWith(path.resolve(WEB_DIR) + path.sep) && file !== path.resolve(WEB_DIR, "index.html")) {
    return false;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const type = contentType(file);
  res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  fs.createReadStream(file).pipe(res);
  return true;
}

function contentType(file) {
  const ext = path.extname(file);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".map": "application/json",
    ".woff2": "font/woff2",
    ".png": "image/png",
  };
  return types[ext] ?? "application/octet-stream";
}

function proxy(req, res, origin) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const target = new URL(origin);
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;
  delete headers["accept-encoding"];
  const preq = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: req.method,
      path: url.pathname + url.search,
      headers,
    },
    (pres) => {
      res.writeHead(pres.statusCode ?? 502, forwardHeaders(pres.headers));
      pres.pipe(res);
    },
  );
  preq.on("error", (error) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Inspector is unavailable: ${error.message}`);
  });
  req.pipe(preq);
}

function forwardHeaders(headers) {
  const copy = { ...headers };
  for (const name of [
    "connection",
    "transfer-encoding",
    "keep-alive",
    "content-security-policy",
    "content-security-policy-report-only",
  ]) {
    delete copy[name];
  }
  return copy;
}

async function handleWorkspaceFile(req, res, url) {
  const session = currentSession();
  if (!session) return sendJson(res, 409, { error: "No lab is open" });
  try {
    if (req.method === "GET" && url.pathname.endsWith("/files")) {
      return sendJson(res, 200, {
        files: listWorkspace(session.workspace),
        workspaceRoot: session.workspace,
      });
    }
    if (req.method === "GET" && url.pathname.endsWith("/file")) {
      return sendJson(res, 200, readWorkspaceFile(session.workspace, url.searchParams.get("path") ?? ""));
    }
    if (req.method === "PUT" && url.pathname.endsWith("/file")) {
      const body = await readJson(req);
      if (body?.sessionId !== session.id) {
        return sendJson(res, 409, { error: "That lab is no longer open." });
      }
      writeWorkspaceFile(session.workspace, body.path, body.text);
      return sendJson(res, 200, { saved: true });
    }
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return sendJson(res, status, { error: error instanceof Error ? error.message : String(error) });
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}
