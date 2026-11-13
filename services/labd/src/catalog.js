import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export function loadCatalog(root) {
  const pathsDir = path.join(root, "paths");
  const paths = fs
    .readdirSync(pathsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadPath(path.join(pathsDir, entry.name)));
  return { paths };
}

export function getLab(catalog, labId) {
  for (const pathEntry of catalog.paths) {
    for (const scenario of pathEntry.scenarios) {
      const lab = scenario.labs.find((item) => item.id === labId);
      if (lab) return { path: pathEntry, scenario, lab };
    }
  }
  return null;
}

export function publicCatalog(catalog) {
  return {
    paths: catalog.paths.map((pathEntry) => ({
      id: pathEntry.id,
      title: pathEntry.title,
      summary: pathEntry.summary,
      scenarios: pathEntry.scenarios.map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        labs: scenario.labs.map(publicLab),
      })),
    })),
  };
}

export function publicLab(lab) {
  return {
    id: lab.id,
    title: lab.title,
    mode: lab.mode,
    clouds: lab.clouds,
    objective: lab.objective,
    brief: lab.brief,
    steps: lab.steps,
    references: lab.references,
    inspector: lab.inspector,
    checkCount: lab.checks.length,
  };
}

function loadPath(dir) {
  const meta = readYaml(path.join(dir, "path.yaml"));
  return {
    id: meta.id,
    title: meta.title,
    summary: meta.summary ?? "",
    scenarios: meta.scenarios.map((id) => loadScenario(dir, meta.id, id)),
  };
}

function loadScenario(pathDir, pathId, scenarioId) {
  const dir = path.join(pathDir, "scenarios", scenarioId);
  const meta = readYaml(path.join(dir, "scenario.yaml"));
  return {
    id: meta.id,
    title: meta.title,
    brief: fs.readFileSync(path.join(dir, "scenario.md"), "utf8"),
    labs: meta.labs.map((labId) => loadLab(dir, pathId, meta.id, labId)),
  };
}

function loadLab(scenarioDir, pathId, scenarioId, labId) {
  const dir = path.join(scenarioDir, "labs", labId);
  const meta = readYaml(path.join(dir, "lab.yaml"));
  if (meta.id !== labId) {
    throw new Error(`${dir} declares id ${meta.id}, expected ${labId}`);
  }
  const checksFile = readYaml(path.resolve(dir, meta.checks));
  const checks = checksFile.checks ?? [];
  for (const check of checks) {
    if (!Array.isArray(check.argv) || check.argv.some((part) => typeof part !== "string")) {
      throw new Error(`Check ${check.id} in ${dir} must use an argv array of strings`);
    }
  }
  const seed = loadSeed(meta, dir);
  return {
    id: `${pathId}/${scenarioId}/${meta.id}`,
    title: meta.title,
    mode: meta.mode,
    clouds: meta.clouds,
    services: meta.services ?? [],
    inspector: meta.inspector,
    objective: meta.objective ?? "",
    brief: fs.readFileSync(path.resolve(dir, meta.brief), "utf8"),
    steps: meta.steps ? fs.readFileSync(path.resolve(dir, meta.steps), "utf8") : "",
    references: loadReferences(meta.references, dir),
    seed,
    checks,
    starterDir: path.resolve(dir, meta.starter),
    dir,
  };
}

function loadSeed(meta, dir) {
  if (!meta.seed) return null;
  if (meta.mode !== "issue") {
    throw new Error(`${dir} seed is only for an issue`);
  }
  const seed = readYaml(path.resolve(dir, meta.seed));
  if (seed.apply !== true) {
    throw new Error(`${dir} seed must apply the starter before it changes the live cloud`);
  }
  if (!Array.isArray(seed.mutate) || seed.mutate.length === 0) {
    throw new Error(`${dir} seed must change the live cloud after apply`);
  }
  for (const argv of seed.mutate) {
    if (!Array.isArray(argv) || argv.some((part) => typeof part !== "string" || part.trim() === "")) {
      throw new Error(`${dir} seed mutate entries must be argv arrays of strings`);
    }
  }
  return {
    apply: true,
    mutate: seed.mutate.map((argv) => argv.map((part) => part.trim())),
  };
}

function loadReferences(references, dir) {
  if (references === undefined) return [];
  if (!Array.isArray(references)) {
    throw new Error(`${dir} references must be a list`);
  }
  for (const reference of references) {
    for (const key of ["title", "url", "why"]) {
      if (typeof reference?.[key] !== "string" || reference[key].trim() === "") {
        throw new Error(`${dir} reference needs a non-empty ${key}`);
      }
    }
    let url;
    try {
      url = new URL(reference.url);
    } catch {
      throw new Error(`${dir} reference has an invalid url`);
    }
    if (url.protocol !== "https:") {
      throw new Error(`${dir} reference url must be https`);
    }
  }
  return references.map((reference) => ({
    title: reference.title,
    url: reference.url,
    why: reference.why,
  }));
}

function readYaml(file) {
  return yaml.load(fs.readFileSync(file, "utf8"));
}
