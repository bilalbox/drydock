import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Docker from "dockerode";
import yaml from "js-yaml";

const CLOUDS = {
  aws: {
    service: "floci",
    container: "drydock-floci",
    origin: "http://floci:4566",
    health: ["/_floci/health", "/health"],
  },
  azure: {
    service: "floci-az",
    container: "drydock-floci-az",
    origin: "http://floci-az:4577",
    health: ["/_floci/health", "/health", "/ready"],
  },
  gcp: {
    service: "floci-gcp",
    container: "drydock-floci-gcp",
    origin: "http://floci-gcp:4588",
    health: ["/_floci/health", "/health", "/ready"],
  },
  oci: {
    service: "floci-oci",
    container: "drydock-floci-oci",
    origin: "http://floci-oci:4599",
    health: ["/_floci-oci/health", "/health", "/ready"],
  },
};

/** Creates a Cloud Emulator lifecycle manager behind Docker and HTTP adapters. */
export function createEmulatorManager({
  composeFile = process.env.CLOUD_COMPOSE_FILE ?? "/opt/drydock/compose.yaml",
  docker = () => new Docker({ socketPath: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock" }),
  fetch = globalThis.fetch,
  hostname = () => os.hostname(),
  healthTimeoutMs = 90_000,
  pollIntervalMs = 1_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const getClient = () => (typeof docker === "function" ? docker() : docker);

  async function ensureClouds(clouds) {
    if (clouds.length === 0) return;
    const client = getClient();
    const projectDir = await hostProjectDir(client, hostname());
    const document = yaml.load(fs.readFileSync(composeFile, "utf8"));
    for (const cloud of clouds) {
      await ensureService(client, document, projectDir, spec(cloud).service);
      await waitHealthy(cloud);
    }
  }

  async function stopClouds(clouds) {
    if (clouds.length === 0) return;
    const client = getClient();
    for (const cloud of clouds) {
      await stopContainer(client, spec(cloud).container);
    }
  }

  async function resetCloud(cloud) {
    const { origin, container } = spec(cloud);
    if (await adminReset(origin)) return;
    const client = getClient();
    try {
      await client.getContainer(container).restart();
    } catch (error) {
      if (error?.statusCode === 404) throw new Error(`${container} is not running`);
      throw error;
    }
    await waitHealthy(cloud);
  }

  async function adminReset(origin) {
    try {
      const response = await fetch(`${origin}/_admin/reset`, { method: "POST" });
      return response.status === 204;
    } catch {
      return false;
    }
  }

  async function waitHealthy(cloud) {
    const { origin, health } = spec(cloud);
    const deadline = Date.now() + healthTimeoutMs;
    let lastError = "emulator did not become healthy";
    while (Date.now() < deadline) {
      for (const probe of health) {
        try {
          const response = await fetch(`${origin}${probe}`);
          if (response.ok) return;
          lastError = `${origin}${probe} returned ${response.status}`;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
      await sleep(pollIntervalMs);
    }
    throw new Error(`${cloud} did not become healthy: ${lastError}`);
  }

  return {
    cloudNames: () => Object.keys(CLOUDS),
    ensureClouds,
    stopClouds,
    resetCloud,
  };
}

async function ensureService(client, document, projectDir, serviceName) {
  const plan = planContainer(document, serviceName, projectDir);
  const existing = client.getContainer(plan.name);
  try {
    const info = await existing.inspect();
    if (!info.State?.Running) await existing.start();
    return;
  } catch (error) {
    if (error?.statusCode !== 404) throw error;
  }
  if (!(await imagePresent(client, plan.image))) await pullImage(client, plan.image);
  const created = await client.createContainer(createOptions(plan, projectDir));
  await created.start();
}

async function hostProjectDir(client, selfId) {
  const info = await client.getContainer(selfId).inspect();
  const mount = info.Mounts?.find((item) => item.Destination === "/data");
  if (!mount?.Source) {
    throw new Error("The lab container has no /data mount, so emulators cannot be started.");
  }
  return path.posix.dirname(mount.Source);
}

async function imagePresent(client, image) {
  try {
    await client.getImage(image).inspect();
    return true;
  } catch (error) {
    if (error?.statusCode === 404) return false;
    throw error;
  }
}

function pullImage(client, image) {
  return new Promise((resolve, reject) => {
    client.pull(image, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }
      client.modem.followProgress(stream, (progressError) => (progressError ? reject(progressError) : resolve()));
    });
  });
}

async function stopContainer(client, name) {
  try {
    await client.getContainer(name).stop();
  } catch (error) {
    if (error?.statusCode === 304 || error?.statusCode === 404) return;
    throw error;
  }
}

function spec(cloud) {
  const found = CLOUDS[cloud];
  if (!found) throw new Error(`Unknown cloud ${cloud}`);
  return found;
}

function planContainer(document, serviceName, projectDir) {
  const service = document.services?.[serviceName];
  if (!service?.image) throw new Error(`Compose service ${serviceName} has no image`);
  const network = networkPlan(service);
  const aliases = new Set([serviceName, ...network.aliases]);
  return {
    service: serviceName,
    name: service.container_name ?? `${document.name ?? "drydock"}-${serviceName}-1`,
    image: service.image,
    user: service.user ? String(service.user) : undefined,
    env: objectEnv(service.environment),
    binds: (service.volumes ?? []).map((entry) => resolveBind(entry, projectDir)),
    ports: (service.ports ?? []).map(parsePort),
    network: network.name,
    aliases: [...aliases],
    project: document.name ?? "drydock",
  };
}

function createOptions(plan, projectDir) {
  const exposed = {};
  const bindings = {};
  for (const port of plan.ports) {
    exposed[port.exposed] = {};
    bindings[port.exposed] ??= [];
    bindings[port.exposed].push(port.binding);
  }
  return {
    name: plan.name,
    Image: plan.image,
    Env: plan.env,
    ...(plan.user ? { User: plan.user } : {}),
    ExposedPorts: exposed,
    Labels: {
      "com.docker.compose.project": plan.project,
      "com.docker.compose.service": plan.service,
      "com.docker.compose.container-number": "1",
      "com.docker.compose.oneoff": "False",
      "com.docker.compose.project.working_dir": projectDir,
      "com.docker.compose.project.config_files": `${projectDir}/compose.yaml`,
    },
    HostConfig: {
      Binds: plan.binds,
      PortBindings: bindings,
      NetworkMode: plan.network,
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [plan.network]: { Aliases: plan.aliases },
      },
    },
  };
}

function resolveBind(entry, projectDir) {
  if (typeof entry !== "string") throw new Error("Compose volume entries must be strings");
  const match = /^(.*?):(\/[^:]+)(?::([a-z]+))?$/.exec(entry);
  if (!match) throw new Error(`Unsupported volume entry: ${entry}`);
  const source = match[1].startsWith("/") ? match[1] : path.posix.join(projectDir, match[1]);
  return match[3] ? `${source}:${match[2]}:${match[3]}` : `${source}:${match[2]}`;
}

function networkPlan(service) {
  const networks = service.networks ?? ["drydock"];
  if (Array.isArray(networks)) return { name: String(networks[0]), aliases: [] };
  const name = Object.keys(networks)[0];
  if (!name) throw new Error(`Compose service ${service.container_name ?? "unknown"} has no network`);
  return { name, aliases: networks[name]?.aliases ?? [] };
}

function objectEnv(environment) {
  if (!environment) return [];
  if (Array.isArray(environment)) return environment.map(String);
  return Object.entries(environment).map(([key, value]) => `${key}=${value ?? ""}`);
}

function parsePort(entry) {
  if (typeof entry !== "string") throw new Error(`Unsupported port entry: ${JSON.stringify(entry)}`);
  const match = /^(?:(?<ip>\d{1,3}(?:\.\d{1,3}){3}):)?(?<host>\d+):(?<container>\d+)(?:\/(?<proto>tcp|udp))?$/.exec(entry);
  if (!match?.groups) throw new Error(`Unsupported port entry: ${entry}`);
  return {
    exposed: `${match.groups.container}/${match.groups.proto ?? "tcp"}`,
    binding: { HostIp: match.groups.ip ?? "", HostPort: match.groups.host },
  };
}
