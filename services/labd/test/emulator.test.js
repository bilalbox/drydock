import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import yaml from "js-yaml";
import { createOptions, planContainer, resolveBind } from "../src/emulatorSet.js";

const composePath = path.resolve(import.meta.dirname, "../../../compose.yaml");
const document = yaml.load(fs.readFileSync(composePath, "utf8"));

test("compose no longer interpolates an empty project directory into a mount", () => {
  const text = fs.readFileSync(composePath, "utf8");
  assert.equal(text.includes("HOST_PROJECT_DIR"), false);
  assert.equal(text.includes("${"), false);
});

test("emulator binds resolve against the host project directory", () => {
  assert.equal(resolveBind("./data/floci-az:/app/data", "/repo"), "/repo/data/floci-az:/app/data");
  assert.equal(
    resolveBind("/var/run/docker.sock:/var/run/docker.sock", "/repo"),
    "/var/run/docker.sock:/var/run/docker.sock",
  );
  assert.equal(resolveBind("./content:/opt/drydock/content:ro", "/repo"), "/repo/content:/opt/drydock/content:ro");
});

test("on-demand services keep the compose ports, aliases, and project labels", () => {
  const projectDir = "/home/learner/drydock";
  const aws = planContainer(document, "floci", projectDir);
  assert.equal(aws.image, "floci/floci:2.4.0");
  assert.equal(aws.name, "drydock-floci");
  assert.deepEqual(aws.ports[0].binding, { HostIp: "127.0.0.1", HostPort: "4566" });
  assert.ok(aws.aliases.includes("floci"));

  const azure = planContainer(document, "floci-az", projectDir);
  assert.ok(azure.binds.includes(`${projectDir}/data/floci-az:/app/data`));

  const gcp = planContainer(document, "floci-gcp", projectDir);
  assert.ok(gcp.aliases.includes("container.floci-gcp"));
  assert.ok(gcp.aliases.includes("floci-gcp"));

  const created = createOptions(aws, projectDir);
  assert.equal(created.Labels["com.docker.compose.project"], "drydock");
  assert.equal(created.Labels["com.docker.compose.service"], "floci");
  assert.equal(created.HostConfig.NetworkMode, "drydock");
  assert.deepEqual(created.HostConfig.PortBindings["4566/tcp"], [{ HostIp: "127.0.0.1", HostPort: "4566" }]);
});
