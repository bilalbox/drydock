import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createStreamConnection, createWebSocketConnection, forward } from "vscode-ws-jsonrpc/server";

export function injectWorkspaceRoot(message, workspace) {
  if (!workspace || !message || message.method !== "initialize" || !message.params) return message;
  if (message.params.rootUri) return message;
  const rootUri = pathToFileURL(workspace).href;
  message.params.rootUri = rootUri;
  message.params.rootPath = workspace;
  message.params.workspaceFolders = [{ name: "workspace", uri: rootUri }];
  return message;
}

export function attachTerraformLsp(ws, workspace) {
  return bridgeWebSocketToCommand(ws, {
    command: "terraform-ls",
    args: ["serve"],
    cwd: workspace,
    env: {
      ...process.env,
      TF_IN_AUTOMATION: "1",
      CHECKPOINT_DISABLE: "1",
    },
  });
}

export function bridgeWebSocketToCommand(ws, { command, args = [], cwd, env }) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stderr?.on("data", (chunk) => {
    const line = chunk.toString("utf8").trim();
    if (line) console.error(`[${command}] ${line}`);
  });
  child.on("error", (error) => {
    console.error(`[${command}] ${error.message}`);
    if (ws.readyState === (ws.OPEN ?? 1)) ws.close();
  });

  const stop = () => {
    try {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    } catch {
      // The process has already exited.
    }
  };
  const onProcessExit = () => stop();
  process.once("exit", onProcessExit);
  child.once("exit", () => process.removeListener("exit", onProcessExit));

  const clientConnection = createWebSocketConnection(asIWebSocket(ws));
  const serverConnection = createStreamConnection(child.stdout, child.stdin, stop);
  forward(clientConnection, serverConnection, (message) => injectWorkspaceRoot(message, cwd));
  return child;
}

function asIWebSocket(ws) {
  return {
    $type: "IWebSocket",
    send: (content) => ws.send(content),
    onMessage: (cb) => {
      ws.on("message", (data) => {
        cb(typeof data === "string" ? data : data.toString("utf8"));
      });
    },
    onError: (cb) => ws.on("error", cb),
    onClose: (cb) => {
      ws.on("close", (code, reason) => {
        cb(code ?? 1000, Buffer.isBuffer(reason) ? reason.toString("utf8") : String(reason ?? ""));
      });
    },
    dispose: () => {
      if (ws.readyState === (ws.OPEN ?? 1) || ws.readyState === (ws.CONNECTING ?? 0)) ws.close();
    },
  };
}
