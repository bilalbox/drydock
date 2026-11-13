import http from "node:http";

const READ_ONLY_MESSAGE = "This console is read-only. Change resources with Terraform.";

const READ_ACTIONS = new Set([
  "list",
  "inspect",
  "download",
  "readMessages",
  "listSnapshots",
  "listNodegroups",
  "listFargateProfiles",
]);

export function decide(method, pathname) {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return "allow";
  if (verb === "POST" && isReadQuery(pathname)) return "allow";
  return "deny";
}

export function isReadQuery(pathname) {
  return pathname.endsWith("/query") || pathname.endsWith("/key-query");
}

export function stripPrefix(pathname) {
  if (pathname === "/inspector") return "/";
  if (pathname.startsWith("/inspector/")) return pathname.slice("/inspector".length) || "/";
  return pathname;
}

export function stripMutations(schema) {
  if (!schema || typeof schema !== "object") return schema;
  const copy = structuredClone(schema);
  if (Array.isArray(copy.actions)) {
    copy.actions = copy.actions.filter((action) => READ_ACTIONS.has(action));
  }
  if (copy.capabilities && typeof copy.capabilities === "object") {
    for (const [key, value] of Object.entries(copy.capabilities)) {
      if (!Array.isArray(value)) continue;
      copy.capabilities[key] = value.filter((capability) => capability && READ_ACTIONS.has(capability.name));
    }
  }
  return copy;
}

export function upstreamRequestPath(pathname, accept, method = "GET") {
  const verb = String(method ?? "GET").toUpperCase();
  if (verb !== "GET" && verb !== "HEAD") return pathname;
  const lastSegment = pathname.split("/").pop() ?? "";
  const documentNav = String(accept ?? "").includes("text/html") && !lastSegment.includes(".");
  return documentNav ? "/" : pathname;
}

export function deniedBody() {
  return JSON.stringify({ error: READ_ONLY_MESSAGE });
}

export function injectBoot(html) {
  const tag = '<script src="/inspector-boot.js"></script>';
  if (html.includes(tag)) return html;
  const match = html.match(/<head[^>]*>/i);
  if (match) return html.replace(match[0], `${match[0]}${tag}`);
  return `${tag}${html}`;
}

export function startGate({ origin, port }) {
  const upstream = new URL(origin);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = stripPrefix(url.pathname);
    if (decide(req.method ?? "GET", path) === "deny") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(deniedBody());
      req.resume();
      return;
    }
    const headers = { ...req.headers, host: upstream.host };
    delete headers.connection;
    delete headers["accept-encoding"];
    const accept = String(req.headers.accept ?? "");
    const requestPath = upstreamRequestPath(path, accept, req.method);
    const preq = http.request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port,
        method: req.method,
        path: requestPath + url.search,
        headers,
      },
      (pres) => {
        const type = String(pres.headers["content-type"] ?? "");
        const rewrite = path.endsWith("/schema") || type.includes("text/html");
        if (!rewrite) {
          const responseHeaders = cleanHeaders(pres.headers);
          res.writeHead(pres.statusCode ?? 502, responseHeaders);
          pres.pipe(res);
          return;
        }
        const chunks = [];
        pres.on("data", (chunk) => chunks.push(chunk));
        pres.on("end", () => {
          let body = Buffer.concat(chunks);
          if (path.endsWith("/schema") && type.includes("json") && (pres.statusCode ?? 500) < 400) {
            try {
              body = Buffer.from(JSON.stringify(stripMutations(JSON.parse(body.toString("utf8")))));
            } catch {
              // Leave a non-JSON schema response unchanged.
            }
          } else if (type.includes("text/html")) {
            body = Buffer.from(injectBoot(body.toString("utf8")));
          }
          const responseHeaders = cleanHeaders(pres.headers);
          responseHeaders["content-length"] = String(body.length);
          delete responseHeaders["content-encoding"];
          res.writeHead(pres.statusCode ?? 502, responseHeaders);
          res.end(body);
        });
      },
    );
    preq.on("error", (error) => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(error.message);
    });
    req.pipe(preq);
  });
  server.listen(port);
  return server;
}

function cleanHeaders(headers) {
  const copy = { ...headers };
  delete copy.connection;
  delete copy["transfer-encoding"];
  delete copy["content-security-policy"];
  delete copy["content-security-policy-report-only"];
  return copy;
}
