import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createEmulatorManager } from "../src/emulatorSet.js";

const composePath = path.resolve(import.meta.dirname, "../../../compose.yaml");

function createFakeDocker({ projectDir = "/home/learner/drydock", existing = {}, images = new Set() } = {}) {
  const created = [];
  const started = [];
  const stopped = [];
  const restarted = [];
  const pulled = [];
  let selfInspects = 0;

  const client = {
    modem: {
      followProgress(_stream, cb) {
        cb(null);
      },
    },
    getContainer(name) {
      if (name === "labd-self") {
        return {
          async inspect() {
            selfInspects += 1;
            return { Mounts: [{ Destination: "/data", Source: `${projectDir}/data` }] };
          },
        };
      }
      return {
        async inspect() {
          const entry = existing[name];
          if (!entry) {
            const err = new Error("not found");
            err.statusCode = 404;
            throw err;
          }
          return entry;
        },
        async start() {
          started.push(name);
        },
        async stop() {
          if (!existing[name]) {
            const err = new Error("not found");
            err.statusCode = 404;
            throw err;
          }
          stopped.push(name);
        },
        async restart() {
          if (!existing[name]) {
            const err = new Error("not found");
            err.statusCode = 404;
            throw err;
          }
          restarted.push(name);
        },
      };
    },
    getImage(image) {
      return {
        async inspect() {
          if (!images.has(image)) {
            const err = new Error("not found");
            err.statusCode = 404;
            throw err;
          }
          return {};
        },
      };
    },
    pull(image, cb) {
      pulled.push(image);
      images.add(image);
      cb(null, {});
    },
    async createContainer(options) {
      created.push(options);
      existing[options.name] = { State: { Running: false } };
      return {
        async start() {
          started.push(options.name);
          existing[options.name].State.Running = true;
        },
      };
    },
  };

  return {
    client,
    created,
    started,
    stopped,
    restarted,
    pulled,
    get selfInspects() {
      return selfInspects;
    },
  };
}

test("compose no longer interpolates an empty project directory into a mount", () => {
  const text = fs.readFileSync(composePath, "utf8");
  assert.equal(text.includes("HOST_PROJECT_DIR"), false);
  assert.equal(text.includes("${"), false);
});

test("ensureClouds pulls, creates, starts, and health-checks on-demand emulators using compose specs", async () => {
  const fake = createFakeDocker({ projectDir: "/home/learner/drydock" });
  const healthCalls = [];
  const manager = createEmulatorManager({
    composeFile: composePath,
    docker: fake.client,
    hostname: () => "labd-self",
    pollIntervalMs: 1,
    sleep: async () => {},
    fetch: async (url) => {
      healthCalls.push(url);
      if (url === "http://floci:4566/_floci/health") return { ok: false, status: 503 };
      return { ok: true, status: 200 };
    },
  });

  await manager.ensureClouds(["aws", "azure", "gcp"]);

  assert.equal(fake.selfInspects, 1);
  assert.deepEqual(fake.pulled, ["floci/floci:2.4.0", "floci/floci-az:0.16.0", "floci/floci-gcp:0.12.0"]);
  assert.deepEqual(fake.started, ["drydock-floci", "drydock-floci-az", "drydock-floci-gcp"]);

  const awsOpts = fake.created.find((item) => item.name === "drydock-floci");
  assert.equal(awsOpts.Labels["com.docker.compose.project"], "drydock");
  assert.equal(awsOpts.Labels["com.docker.compose.service"], "floci");
  assert.equal(awsOpts.HostConfig.NetworkMode, "drydock");
  assert.deepEqual(awsOpts.HostConfig.PortBindings["4566/tcp"], [{ HostIp: "127.0.0.1", HostPort: "4566" }]);
  assert.ok(awsOpts.HostConfig.Binds.includes("/var/run/docker.sock:/var/run/docker.sock"));
  assert.ok(awsOpts.NetworkingConfig.EndpointsConfig.drydock.Aliases.includes("floci"));

  const azOpts = fake.created.find((item) => item.name === "drydock-floci-az");
  assert.ok(azOpts.HostConfig.Binds.includes("/home/learner/drydock/data/floci-az:/app/data"));

  const gcpOpts = fake.created.find((item) => item.name === "drydock-floci-gcp");
  assert.ok(gcpOpts.NetworkingConfig.EndpointsConfig.drydock.Aliases.includes("container.floci-gcp"));
  assert.ok(gcpOpts.NetworkingConfig.EndpointsConfig.drydock.Aliases.includes("floci-gcp"));
  assert.ok(healthCalls.includes("http://floci:4566/health"));
});

test("ensureClouds starts stopped containers and stopClouds ignores missing containers", async () => {
  const fake = createFakeDocker({
    existing: { "drydock-floci": { State: { Running: false } } },
  });
  const manager = createEmulatorManager({
    composeFile: composePath,
    docker: fake.client,
    hostname: () => "labd-self",
    pollIntervalMs: 1,
    sleep: async () => {},
    fetch: async () => ({ ok: true, status: 200 }),
  });

  await manager.ensureClouds(["aws"]);
  assert.equal(fake.created.length, 0);
  assert.deepEqual(fake.started, ["drydock-floci"]);

  await manager.stopClouds(["aws", "oci"]);
  assert.deepEqual(fake.stopped, ["drydock-floci"]);
});

test("resetCloud uses admin reset when available and falls back to container restart", async () => {
  const fake = createFakeDocker({
    existing: { "drydock-floci": { State: { Running: true } } },
  });
  let adminStatus = 204;
  const manager = createEmulatorManager({
    composeFile: composePath,
    docker: fake.client,
    hostname: () => "labd-self",
    pollIntervalMs: 1,
    sleep: async () => {},
    fetch: async (url, init) => {
      if (url.endsWith("/_admin/reset") && init?.method === "POST") {
        return { ok: adminStatus === 204, status: adminStatus };
      }
      return { ok: true, status: 200 };
    },
  });

  await manager.resetCloud("aws");
  assert.deepEqual(fake.restarted, []);

  adminStatus = 404;
  await manager.resetCloud("aws");
  assert.deepEqual(fake.restarted, ["drydock-floci"]);
});
