import path from "node:path";
import { createDiagramRenderer } from "./diagram.js";
import { randomUUID } from "node:crypto";
import { createEmulatorManager } from "./emulatorSet.js";
import { attachTerraformLsp } from "./terraformLsp.js";
import { attachTerminal as attachToolboxTerminal, runInToolbox } from "./toolbox.js";
import {
  createWorkspace,
  listWorkspaceFiles,
  pruneWorkspaces,
  readWorkspaceFile,
  removeWorkspace,
  writeWorkspaceFile,
} from "./workspace.js";

/** Domain error raised by Session operations without HTTP coupling. */
export class SessionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SessionError";
    this.code = code;
  }
}

/** Creates the Session manager owning active lab state, grading, and attached sockets. */
export function createSessionManager({
  workspacesDir = process.env.WORKSPACES_DIR ?? "/workspaces",
  checksDir = process.env.CHECKS_DIR ?? "/opt/drydock/checks",
  lock,
  emulators = createEmulatorManager(),
  toolbox = { run: runInToolbox, attachTerminal: attachToolboxTerminal },
  lsp = { attach: attachTerraformLsp },
  pruneOnStart = true,
} = {}) {
  if (pruneOnStart) {
    pruneWorkspaces(workspacesDir);
  }

  const renderDiagram = createDiagramRenderer();
  let active = null;
  let chain = Promise.resolve();

  function enqueue(task) {
    const run = chain.then(task, task);
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  function requireActive() {
    if (!active) throw new SessionError("NO_SESSION", "No lab is open");
    return active;
  }

  function teardownActive() {
    if (!active) return;
    for (const ws of active.sockets) {
      closeSocket(ws, 4000, "Session replaced");
    }
    active.sockets.clear();
    removeWorkspace(active.workspace);
    active = null;
  }

  async function openNow(lab) {
    teardownActive();
    const unused = emulators.cloudNames().filter((cloud) => !lab.clouds.includes(cloud));
    await emulators.stopClouds(unused);
    await emulators.ensureClouds(lab.clouds);
    for (const cloud of lab.clouds) await emulators.resetCloud(cloud);

    const id = randomUUID();
    const workspace = path.join(workspacesDir, id);
    let env;
    try {
      const created = createWorkspace({ lab, dest: workspace, lock });
      env = created.env;
      const commands = [
        ...created.prepare,
        ["terraform", "init", "-input=false", "-no-color"],
        ...seedCommands(lab),
      ];
      for (const argv of commands) {
        const result = await toolbox.run(argv, { cwd: workspace, env });
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || result.stdout || `${argv[0]} failed`);
        }
      }
    } catch (error) {
      removeWorkspace(workspace);
      throw error;
    }

    active = {
      id,
      labId: lab.id,
      workspace,
      clouds: lab.clouds,
      env,
      lab,
      sockets: new Set(),
    };
    return publicSession(active);
  }

  function trackSocket(session, ws) {
    session.sockets.add(ws);
    ws.once?.("close", () => {
      session.sockets.delete(ws);
    });
  }

  return {
    diagram: () => renderDiagram(requireActive()),
    current: () => (active ? publicSession(active) : null),
    open: (lab) => enqueue(() => openNow(lab)),
    reset: () => enqueue(() => openNow(requireActive().lab)),
    grade: () =>
      enqueue(async () => {
        const session = requireActive();
        return evaluateChecks(session.lab.checks, toolbox, {
          cwd: checksDir,
          env: session.env,
        });
      }),
    listFiles: () => {
      const session = requireActive();
      return {
        files: listWorkspaceFiles(session.workspace),
        workspaceRoot: session.workspace,
      };
    },
    readFile: (relative) => readWorkspaceFile(requireActive().workspace, relative),
    writeFile: ({ sessionId, path: relative, text }) => {
      const session = requireActive();
      if (sessionId !== session.id) {
        throw new SessionError("SESSION_MISMATCH", "That lab is no longer open.");
      }
      writeWorkspaceFile(session.workspace, relative, text);
    },
    attachTerminal: (ws) => {
      if (!active) {
        ws.send(JSON.stringify({ t: "e", d: "Start a lab before using the terminal." }));
        ws.close();
        return;
      }
      const session = active;
      trackSocket(session, ws);
      Promise.resolve(toolbox.attachTerminal(ws, { cwd: session.workspace, env: session.env })).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: "e", d: message }));
        closeSocket(ws);
      });
    },
    attachLsp: (ws) => {
      if (!active) {
        ws.close(4409, "No lab is open");
        return;
      }
      const session = active;
      trackSocket(session, ws);
      try {
        lsp.attach(ws, session.workspace);
      } catch (error) {
        console.error("[terraform-ls]", error instanceof Error ? error.message : error);
        closeSocket(ws);
      }
    },
    close: () => teardownActive(),
  };
}

function publicSession(session) {
  const [cloud, service] = [session.lab.inspector.cloud, session.lab.inspector.service];
  return {
    id: session.id,
    workspaceId: session.id,
    labId: session.labId,
    clouds: session.clouds,
    inspectorPath: `/inspector/cloud-explorer/${cloud}/${service}`,
  };
}

function seedCommands(lab) {
  if (!lab.seed) return [];
  return [
    ["terraform", "apply", "-auto-approve", "-input=false", "-no-color"],
    ...lab.seed.mutate,
  ];
}

function closeSocket(ws, code, reason) {
  try {
    if (ws.readyState === (ws.OPEN ?? 1) || ws.readyState === (ws.CONNECTING ?? 0)) {
      if (code !== undefined) ws.close(code, reason);
      else ws.close();
    }
  } catch {
    // Ignore sockets already tearing down.
  }
}

async function evaluateChecks(checks, toolbox, opts) {
  const results = [];
  for (const check of checks) {
    const result = await toolbox.run(check.argv, opts);
    let passed = result.exitCode === (check.expect_exit ?? 0);
    let detail = "";
    if (passed && (check.expect_json !== undefined || check.expect_json_includes !== undefined)) {
      try {
        const actual = JSON.parse(result.stdout);
        if (check.expect_json !== undefined && !jsonSubset(check.expect_json, actual)) passed = false;
        if (passed && check.expect_json_includes !== undefined && !jsonIncludes(check.expect_json_includes, actual)) {
          passed = false;
        }
        if (!passed) detail = "The emulator response did not include the expected fields.";
      } catch {
        passed = false;
        detail = "The command did not return JSON.";
      }
    }
    if (!passed && !detail) {
      detail = (result.stderr || result.stdout || "Command failed.").trim().slice(0, 2000);
    }
    results.push({
      id: check.id,
      passed,
      exitCode: result.exitCode,
      detail,
    });
  }
  return { passed: results.every((item) => item.passed), checks: results };
}

function jsonSubset(expected, actual) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) return false;
    return expected.every((item, index) => jsonSubset(item, actual[index]));
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    return Object.entries(expected).every(([key, value]) => jsonSubset(value, actual[key]));
  }
  return Object.is(expected, actual);
}

function jsonIncludes(expected, actual) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((item) => actual.some((candidate) => jsonIncludes(item, candidate)));
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    return Object.entries(expected).every(([key, value]) => jsonIncludes(value, actual[key]));
  }
  return Object.is(expected, actual);
}

