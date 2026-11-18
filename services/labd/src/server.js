import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { getLab, loadCatalog, publicCatalog } from "./catalog.js";
import { createInspectorHandler } from "./inspector.js";
import { createSessionManager } from "./session.js";

const ERROR_STATUS = {
  INVALID_PATH: 400,
  INVALID_CONTENT: 400,
  READ_ONLY: 403,
  NOT_FOUND: 404,
  NO_SESSION: 409,
  SESSION_MISMATCH: 409,
  TOO_LARGE: 413,
  BINARY_FILE: 415,
};

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".map": "application/json",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".png": "image/png",
};

/** Creates the Drydock HTTP and WebSocket server without binding a port on import. */
export function createLabdServer({
  contentDir = process.env.CONTENT_DIR ?? path.resolve("content"),
  lockPath = process.env.LOCK_PATH ?? path.resolve("providers.lock.json"),
  webDir = process.env.WEB_DIR ?? path.resolve("web"),
  catalog = loadCatalog(contentDir),
  lock = JSON.parse(fs.readFileSync(lockPath, "utf8")),
  session = createSessionManager({ lock }),
  inspector = createInspectorHandler(),
} = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/api/diagram") {
        const svg = await session.diagram();
        res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; img-src data:; sandbox" });
        return res.end(svg);
      }
      if (req.method === "GET" && url.pathname === "/api/health") {
        return sendJson(res, 200, { status: "ok" });
      }
      if (req.method === "GET" && url.pathname === "/api/catalog") {
        return sendJson(res, 200, publicCatalog(catalog));
      }
      if (req.method === "GET" && url.pathname === "/api/sessions/current") {
        return sendJson(res, 200, session.current());
      }
      if (req.method === "POST" && url.pathname === "/api/sessions") {
        const body = await readJson(req);
        const found = getLab(catalog, body.labId);
        if (!found) return sendJson(res, 404, { error: "Unknown lab" });
        return sendJson(res, 201, await session.open(found.lab));
      }
      if (req.method === "POST" && url.pathname === "/api/sessions/current/reset") {
        return sendJson(res, 200, await session.reset());
      }
      if (req.method === "POST" && url.pathname === "/api/sessions/current/check") {
        return sendJson(res, 200, await session.grade());
      }
      if (url.pathname === "/api/sessions/current/files" || url.pathname === "/api/sessions/current/file") {
        return await handleWorkspaceFile(req, res, url, session);
      }
      if (inspector.matches(url.pathname)) {
        inspector.handle(req, res, url);
        return;
      }
      if ((req.method === "GET" || req.method === "HEAD") && serveStatic(webDir, url.pathname, req, res)) {
        return;
      }
      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      const status = ERROR_STATUS[error?.code] ?? 500;
      const message = error instanceof Error ? error.message : String(error);
      if (status === 500) console.error("[drydock]", message);
      if (!res.headersSent) sendJson(res, status, { error: message });
    }
  });

  const sockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/lsp/terraform") {
      sockets.handleUpgrade(req, socket, head, (ws) => session.attachLsp(ws));
      return;
    }
    if (url.pathname === "/term") {
      sockets.handleUpgrade(req, socket, head, (ws) => session.attachTerminal(ws));
      return;
    }
    socket.destroy();
  });

  server.requestTimeout = 600_000;

  async function close() {
    session.close();
    sockets.close();
    await new Promise((resolve) => server.close(() => resolve()));
  }

  return { server, session, close };
}

async function handleWorkspaceFile(req, res, url, session) {
  if (req.method === "GET" && url.pathname.endsWith("/files")) {
    return sendJson(res, 200, session.listFiles());
  }
  if (req.method === "GET" && url.pathname.endsWith("/file")) {
    return sendJson(res, 200, session.readFile(url.searchParams.get("path") ?? ""));
  }
  if (req.method === "PUT" && url.pathname.endsWith("/file")) {
    const body = await readJson(req);
    session.writeFile({ sessionId: body?.sessionId, path: body.path, text: body.text });
    return sendJson(res, 200, { saved: true });
  }
  return sendJson(res, 405, { error: "Method not allowed" });
}

function serveStatic(webDir, pathname, req, res) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (relative.includes("\0")) return false;
  const resolvedRoot = path.resolve(webDir);
  const file = path.resolve(resolvedRoot, relative);
  if (!file.startsWith(resolvedRoot + path.sep) && file !== path.resolve(resolvedRoot, "index.html")) {
    return false;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const type = CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  fs.createReadStream(file).pipe(res);
  return true;
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8080);
  const { server } = createLabdServer();
  server.listen(port, () => {
    console.log(`drydock listening on ${port}`);
  });
}
