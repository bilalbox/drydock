import http from "node:http";

const READ_ONLY_MESSAGE = "This console is read-only. Change resources with Terraform.";

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

const READ_ACTIONS = new Set([
  "list",
  "inspect",
  "download",
  "readMessages",
  "listSnapshots",
  "listNodegroups",
  "listFargateProfiles",
]);

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

/** Creates the read-only Inspector proxy and boot script handler for Floci UI. */
export function createInspectorHandler({
  origin = process.env.FLOCI_UI_ORIGIN ?? process.env.INSPECTOR_ORIGIN ?? "http://floci-ui:4500",
} = {}) {
  const upstream = new URL(origin);

  function matches(pathname) {
    if (pathname === "/inspector-boot.js") return true;
    return INSPECTOR_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }

  function handle(req, res, url = new URL(req.url ?? "/", "http://localhost")) {
    if (req.method === "GET" && url.pathname === "/inspector-boot.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(BOOT_SCRIPT);
      return;
    }

    const strippedPath = stripPrefix(url.pathname);
    if (!isAllowed(req.method ?? "GET", strippedPath)) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: READ_ONLY_MESSAGE }));
      req.resume();
      return;
    }

    const headers = { ...req.headers, host: upstream.host };
    delete headers.connection;
    delete headers["accept-encoding"];
    const requestPath = upstreamRequestPath(strippedPath, req.headers.accept, req.method);

    const preq = http.request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port,
        method: req.method,
        path: requestPath + url.search,
        headers,
      },
      (pres) => forwardUpstreamResponse(pres, res, strippedPath),
    );
    preq.on("error", (error) => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Inspector is unavailable: ${error.message}`);
    });
    req.pipe(preq);
  }

  return { matches, handle };
}

function forwardUpstreamResponse(pres, res, strippedPath) {
  const type = String(pres.headers["content-type"] ?? "");
  const rewrite = strippedPath.endsWith("/schema") || type.includes("text/html");
  if (!rewrite) {
    res.writeHead(pres.statusCode ?? 502, cleanHeaders(pres.headers));
    pres.pipe(res);
    return;
  }
  const chunks = [];
  pres.on("data", (chunk) => chunks.push(chunk));
  pres.on("end", () => {
    let body = Buffer.concat(chunks);
    if (strippedPath.endsWith("/schema") && type.includes("json") && (pres.statusCode ?? 500) < 400) {
      try {
        body = Buffer.from(JSON.stringify(stripMutations(JSON.parse(body.toString("utf8")))));
      } catch {
        // Leave a non-JSON schema response unchanged.
      }
    } else if (type.includes("text/html")) {
      body = Buffer.from(injectBoot(body.toString("utf8")));
    }
    const headers = cleanHeaders(pres.headers);
    headers["content-length"] = String(body.length);
    delete headers["content-encoding"];
    res.writeHead(pres.statusCode ?? 502, headers);
    res.end(body);
  });
}

function isAllowed(method, pathname) {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return true;
  if (verb === "POST" && (pathname.endsWith("/query") || pathname.endsWith("/key-query"))) return true;
  return false;
}

function stripPrefix(pathname) {
  if (pathname === "/inspector") return "/";
  if (pathname.startsWith("/inspector/")) return pathname.slice("/inspector".length) || "/";
  return pathname;
}

function upstreamRequestPath(pathname, accept, method = "GET") {
  const verb = String(method ?? "GET").toUpperCase();
  if (verb !== "GET" && verb !== "HEAD") return pathname;
  const lastSegment = pathname.split("/").pop() ?? "";
  const documentNav = String(accept ?? "").includes("text/html") && !lastSegment.includes(".");
  return documentNav ? "/" : pathname;
}

function stripMutations(schema) {
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

function injectBoot(html) {
  const tag = '<script src="/inspector-boot.js"></script>';
  if (html.includes(tag)) return html;
  const match = html.match(/<head[^>]*>/i);
  if (match) return html.replace(match[0], `${match[0]}${tag}`);
  return `${tag}${html}`;
}

function cleanHeaders(headers) {
  const copy = { ...headers };
  delete copy.connection;
  delete copy["transfer-encoding"];
  delete copy["content-security-policy"];
  delete copy["content-security-policy-report-only"];
  return copy;
}
