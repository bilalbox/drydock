import Docker from "dockerode";
import { Writable } from "node:stream";

const CONTAINER = () => process.env.TOOLBOX_CONTAINER ?? "drydock-toolbox";

// Docker exec replaces the container environment. These keep the image binaries reachable.
const BASE_ENV = {
  PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  LANG: "C.UTF-8",
  TERM: "xterm-256color",
};

function docker() {
  return new Docker({ socketPath: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock" });
}

export async function runInToolbox(argv, { cwd, env }) {
  const container = docker().getContainer(CONTAINER());
  const exec = await container.exec({
    Cmd: argv,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    WorkingDir: cwd,
    Env: envList(env),
  });
  const stream = await exec.start({ hijack: true, stdin: false });
  const stdout = [];
  const stderr = [];
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    container.modem.demuxStream(
      stream,
      new Writable({
        write(chunk, _encoding, callback) {
          stdout.push(chunk);
          callback();
        },
      }),
      new Writable({
        write(chunk, _encoding, callback) {
          stderr.push(chunk);
          callback();
        },
      }),
    );
    stream.on("end", finish);
    stream.on("close", finish);
    stream.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
  const info = await waitForExit(exec);
  return {
    exitCode: info.ExitCode ?? 1,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

export async function attachTerminal(ws, { cwd, env }) {
  const container = docker().getContainer(CONTAINER());
  const exec = await container.exec({
    Cmd: ["bash", "-i"],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    WorkingDir: cwd,
    Env: envList({ ...env, HOME: cwd, TERM: "xterm-256color" }),
  });
  const stream = await exec.start({ hijack: true, stdin: true });
  stream.on("data", (chunk) => {
    if (ws.readyState === ws.OPEN) ws.send(chunk);
  });
  const closeSocket = () => {
    if (ws.readyState === ws.OPEN) ws.close();
  };
  stream.on("end", closeSocket);
  stream.on("close", closeSocket);
  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    let message;
    try {
      message = JSON.parse(data.toString("utf8"));
    } catch {
      return;
    }
    if (message.t === "i" && typeof message.d === "string") {
      try {
        stream.write(message.d);
      } catch {
        // The shell has already exited.
      }
    }
    if (message.t === "r" && message.cols > 0 && message.rows > 0) {
      exec.resize({ w: message.cols, h: message.rows }).catch(() => {});
    }
  });
  ws.on("close", () => stream.end());
  return exec;
}

function envList(env) {
  return Object.entries({ ...BASE_ENV, ...env }).map(([key, value]) => `${key}=${value ?? ""}`);
}

async function waitForExit(exec) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const info = await exec.inspect();
    if (info.ExitCode !== null && info.ExitCode !== undefined) return info;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { ExitCode: 1 };
}
