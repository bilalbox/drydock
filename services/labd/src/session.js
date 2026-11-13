import path from "node:path";
import { randomUUID } from "node:crypto";
import { seedArgv } from "./catalog.js";
import { grade } from "./grader.js";
import { materializeWorkspace } from "./workspace.js";
import { ensureClouds, resetCloud, stopClouds, cloudNames } from "./emulatorSet.js";
import { runInToolbox } from "./toolbox.js";
import { markStarted, recordAttempt } from "./progress.js";

const CHECKS_DIR = process.env.CHECKS_DIR ?? "/opt/drydock/checks";
const WORKSPACES = () => process.env.WORKSPACES_DIR ?? "/workspaces";

let current = null;
let chain = Promise.resolve();

export function currentSession() {
  return current;
}

function enqueue(task) {
  const run = chain.then(task, task);
  chain = run.then(
    () => {},
    () => {},
  );
  return run;
}

export function openSession(args) {
  return enqueue(() => openSessionNow(args));
}

async function openSessionNow({ lab, lock, progressFile }) {
  current = null;
  const unused = cloudNames().filter((cloud) => !lab.clouds.includes(cloud));
  await stopClouds(unused);
  await ensureClouds(lab.clouds);
  for (const cloud of lab.clouds) await resetCloud(cloud);
  const id = randomUUID();
  const workspace = path.join(WORKSPACES(), id);
  const { env, prepare } = materializeWorkspace({ lab, dest: workspace, lock });
  const runtimeEnv = { ...env, HOME: workspace };
  for (const argv of prepare) {
    const result = await runInToolbox(argv, { cwd: workspace, env: runtimeEnv });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `${argv[0]} failed`);
    }
  }
  const init = await runInToolbox(["terraform", "init", "-input=false", "-no-color"], {
    cwd: workspace,
    env: runtimeEnv,
  });
  if (init.exitCode !== 0) {
    throw new Error(init.stderr || init.stdout || "terraform init failed");
  }
  for (const argv of seedArgv(lab)) {
    const result = await runInToolbox(argv, { cwd: workspace, env: runtimeEnv });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `${argv[0]} failed`);
    }
  }
  current = {
    id,
    labId: lab.id,
    workspace,
    clouds: lab.clouds,
    env: runtimeEnv,
    lab,
  };
  markStarted(progressFile, lab.id);
  return publicSession(current);
}

export function resetSession(args) {
  return enqueue(async () => {
    if (!current) throw new Error("No lab is open");
    const lab = current.lab;
    return openSessionNow({ lab, lock: args.lock, progressFile: args.progressFile });
  });
}

export function gradeSession(progressFile) {
  return enqueue(async () => {
    if (!current) throw new Error("No lab is open");
    const attempt = await grade(current.lab.checks, { run: runInToolbox }, {
      cwd: CHECKS_DIR,
      env: current.env,
    });
    recordAttempt(progressFile, current.labId, attempt);
    return attempt;
  });
}

export function publicSession(session) {
  const [cloud, service] = [session.lab.inspector.cloud, session.lab.inspector.service];
  return {
    id: session.id,
    workspaceId: session.id,
    labId: session.labId,
    clouds: session.clouds,
    inspectorPath: `/inspector/cloud-explorer/${cloud}/${service}`,
  };
}
