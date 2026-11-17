import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { getLab, loadCatalog, publicLab } from "../src/catalog.js";
import { createSessionManager } from "../src/session.js";
import { createWorkspace } from "../src/workspace.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const lock = JSON.parse(fs.readFileSync(path.join(root, "providers.lock.json"), "utf8"));
const labId = "artifact-storage/northline/private-artifact-bucket";

function makeSessionForTest(toolboxRun) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drydock-lab-test-"));
  return createSessionManager({
    workspacesDir: path.join(dir, "workspaces"),
    checksDir: "/opt/drydock/checks",
    lock,
    emulators: {
      cloudNames: () => ["aws", "azure", "gcp", "oci"],
      stopClouds: async () => {},
      ensureClouds: async () => {},
      resetCloud: async () => {},
    },
    toolbox: {
      run: toolboxRun,
      attachTerminal: async () => {},
    },
    lsp: { attach: () => {} },
  });
}

test("catalog loads the private artifact bucket lab without exposing checks", () => {
  const catalog = loadCatalog(path.join(root, "content"));
  const found = getLab(catalog, labId);
  assert.ok(found);
  assert.equal(found.lab.mode, "guided");
  assert.deepEqual(found.lab.clouds, ["aws"]);
  assert.equal(found.lab.checks.length, 3);
  assert.ok(found.lab.checks.every((check) => Array.isArray(check.argv)));
  const view = publicLab(found.lab);
  assert.equal(view.checkCount, 3);
  assert.equal(view.checks, undefined);
  assert.match(view.brief, /northline-artifacts/);
  assert.equal(view.references.length, 3);
  assert.ok(view.references.every((reference) => reference.url.startsWith("https://docs.aws.amazon.com/")));
  assert.match(view.references.map((reference) => reference.title).join("\n"), /Versioning/);
  assert.match(view.references.map((reference) => reference.why).join(" "), /overwrite keeps/);
  assert.match(view.steps, /Why this is required/);
});

test("expire-old-builds is a challenge that starts from the private bucket", () => {
  const catalog = loadCatalog(path.join(root, "content"));
  const { lab } = getLab(catalog, "artifact-storage/northline/expire-old-builds");
  assert.equal(lab.mode, "challenge");
  assert.equal(lab.steps, "");
  assert.equal(lab.checks.length, 4);
  const view = publicLab(lab);
  assert.equal(view.checks, undefined);
  assert.equal(view.seed, undefined);
  assert.deepEqual(view.references, []);
  assert.match(view.brief, /noncurrent versions after 30 days/);
  assert.doesNotMatch(view.brief, /main\.tf|aws_s3_bucket_lifecycle/);
  assert.match(view.objective, /noncurrent versions/);
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "drydock-"));
  createWorkspace({ lab, dest, lock });
  const starter = fs.readFileSync(path.join(dest, "main.tf"), "utf8");
  const solution = fs.readFileSync(path.join(lab.dir, "solution", "main.tf"), "utf8");
  assert.match(starter, /northline-artifacts/);
  assert.match(starter, /aws_s3_bucket_versioning/);
  assert.doesNotMatch(starter, /aws_s3_bucket_lifecycle_configuration|noncurrent_days/);
  assert.match(solution, /noncurrent_days\s+=\s+30/);
  assert.match(solution, /days_after_initiation\s+=\s+7/);
  assert.notEqual(starter, solution);
  assert.doesNotMatch(starter, /Expire noncurrent/);
});

test("current-release-gone applies starter and mutates live bucket when session opens", async () => {
  const catalog = loadCatalog(path.join(root, "content"));
  const { lab } = getLab(catalog, "artifact-storage/northline/current-release-gone");
  assert.equal(lab.mode, "issue");
  assert.equal(lab.steps, "");
  assert.equal(lab.seed.apply, true);
  const view = publicLab(lab);
  assert.equal(view.checks, undefined);
  assert.equal(view.seed, undefined);
  assert.deepEqual(view.references, []);
  assert.doesNotMatch(JSON.stringify(view), /Expiration|put-bucket-lifecycle|lifecycle configuration/);
  assert.match(view.brief, /night shift was in the console/);
  assert.match(view.brief, /Expire noncurrent versions after 30 days/);

  const executed = [];
  const session = makeSessionForTest(async (argv) => {
    executed.push(argv);
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  await session.open(lab);
  assert.deepEqual(executed[0], ["terraform", "init", "-input=false", "-no-color"]);
  assert.deepEqual(executed[1], ["terraform", "apply", "-auto-approve", "-input=false", "-no-color"]);
  const drift = JSON.parse(executed[2][executed[2].length - 1]);
  assert.equal(drift.Rules[0].Expiration.Days, 30);
  assert.equal(drift.Rules[0].NoncurrentVersionExpiration, undefined);

  const starter = session.readFile("main.tf").text;
  assert.match(starter, /aws_s3_bucket_versioning/);
  assert.doesNotMatch(starter, /lifecycle|Expiration|noncurrent_days/);
  assert.throws(() => session.readFile("seed.yaml"), (err) => err.code === "NOT_FOUND");
  const solution = fs.readFileSync(path.join(lab.dir, "solution", "main.tf"), "utf8");
  assert.match(solution, /noncurrent_days\s+=\s+30/);
  assert.match(solution, /days_after_initiation\s+=\s+7/);
});

test("catalog rejects a reference that is not https", () => {
  const content = fs.mkdtempSync(path.join(os.tmpdir(), "drydock-content-"));
  const labDir = path.join(content, "paths", "p", "scenarios", "s", "labs", "bad");
  fs.mkdirSync(path.join(labDir, "starter"), { recursive: true });
  fs.writeFileSync(path.join(content, "paths", "p", "path.yaml"), "id: p\ntitle: P\nscenarios: [s]\n");
  fs.writeFileSync(path.join(content, "paths", "p", "scenarios", "s", "scenario.yaml"), "id: s\ntitle: S\nlabs: [bad]\n");
  fs.writeFileSync(path.join(content, "paths", "p", "scenarios", "s", "scenario.md"), "story\n");
  fs.writeFileSync(path.join(labDir, "brief.md"), "brief\n");
  fs.writeFileSync(path.join(labDir, "checks.yaml"), "checks: []\n");
  fs.writeFileSync(path.join(labDir, "starter", "main.tf"), "#\n");
  fs.writeFileSync(
    path.join(labDir, "lab.yaml"),
    `id: bad
title: Bad
mode: challenge
clouds: [aws]
inspector:
  cloud: aws
  service: storage
objective: No
brief: brief.md
starter: starter
checks: checks.yaml
references:
  - title: Docs
    url: http://example.com/docs
    why: Because
`,
  );
  assert.throws(() => loadCatalog(content), /https/);
});

test("workspace copy keeps the solution out of the learner files", () => {
  const catalog = loadCatalog(path.join(root, "content"));
  const { lab } = getLab(catalog, labId);
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "drydock-"));
  createWorkspace({ lab, dest, lock });
  const starter = fs.readFileSync(path.join(dest, "main.tf"), "utf8");
  const solution = fs.readFileSync(path.join(lab.dir, "solution", "main.tf"), "utf8");
  assert.notEqual(starter, solution);
  assert.doesNotMatch(starter, /northline-artifacts/);
  assert.match(fs.readFileSync(path.join(dest, "provider.tf"), "utf8"), /http:\/\/floci:4566/);
  assert.match(fs.readFileSync(path.join(dest, ".drydock", "env"), "utf8"), /AWS_ENDPOINT_URL='http:\/\/floci:4566'/);
});

test("provider mirror versions match the lock file", () => {
  const mirror = fs.readFileSync(path.join(root, "services/toolbox/mirror.tf"), "utf8");
  for (const provider of Object.values(lock.providers)) {
    assert.match(mirror, new RegExp(`source\\s+=\\s+"${provider.source}"`));
    assert.match(mirror, new RegExp(`version\\s+=\\s+"${provider.version}"`));
  }
});

test("session grading passes artifact checks only when the emulator agrees", async () => {
  const { lab } = getLab(loadCatalog(path.join(root, "content")), labId);
  let versioningStatus = "Enabled";
  const session = makeSessionForTest(async (argv) => {
    if (argv[0] === "terraform") return { exitCode: 0, stdout: "", stderr: "" };
    const command = argv[2];
    if (command === "head-bucket") return { exitCode: 0, stdout: "", stderr: "" };
    if (command === "get-bucket-versioning") {
      return { exitCode: 0, stdout: JSON.stringify({ Status: versioningStatus, MFADelete: "Disabled" }), stderr: "" };
    }
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      }),
      stderr: "",
    };
  });

  await session.open(lab);
  const passed = await session.grade();
  assert.equal(passed.passed, true);

  versioningStatus = "Suspended";
  const failed = await session.grade();
  assert.equal(failed.passed, false);
  assert.equal(failed.checks.find((check) => check.id === "versioning-enabled").passed, false);
});

test("session grading accepts retained noncurrent builds and rejects expiring the current object", async () => {
  const { lab } = getLab(loadCatalog(path.join(root, "content")), "artifact-storage/northline/expire-old-builds");
  let lifecycle = {
    Rules: [
      {
        ID: "expire-old-builds",
        Status: "Enabled",
        Filter: {},
        NoncurrentVersionExpiration: { NoncurrentDays: 30 },
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
      },
    ],
  };
  const session = makeSessionForTest(async (argv) => {
    if (argv[0] === "terraform") return { exitCode: 0, stdout: "", stderr: "" };
    const command = argv[2];
    if (command === "head-bucket") return { exitCode: 0, stdout: "", stderr: "" };
    if (command === "get-bucket-versioning") {
      return { exitCode: 0, stdout: JSON.stringify({ Status: "Enabled" }), stderr: "" };
    }
    if (command === "get-bucket-lifecycle-configuration") {
      return { exitCode: 0, stdout: JSON.stringify(lifecycle), stderr: "" };
    }
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      }),
      stderr: "",
    };
  });

  await session.open(lab);
  const passed = await session.grade();
  assert.equal(passed.passed, true);

  lifecycle = {
    Rules: [
      {
        Status: "Enabled",
        Expiration: { Days: 30 },
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
      },
    ],
  };
  const expiredCurrent = await session.grade();
  assert.equal(expiredCurrent.passed, false);
  assert.equal(expiredCurrent.checks.find((check) => check.id === "old-versions-expire").passed, false);
});

const VALID_INSPECTOR_SERVICES = new Set([
  "compute",
  "k8s",
  "serverless",
  "containers",
  "registry",
  "sagemaker",
  "storage",
  "table",
  "database",
  "dsql",
  "cache",
  "nosql",
  "search",
  "analytics",
  "networking",
  "workflows",
  "loadbalancing",
  "cdn",
  "dns",
  "messaging",
  "sns",
  "queue",
  "streams",
  "events",
  "eventsv2",
  "identity",
  "cognito",
  "apigateway",
  "email",
  "kms",
  "certificates",
  "parameters",
  "secrets",
  "iac",
  "configuration",
  "cicd",
  "scheduler",
  "logs",
  "cloudwatch",
  "xray",
  "workrequests",
]);

test("all catalog labs follow mode, inspector, and starter/solution conventions", () => {
  const catalog = loadCatalog(path.join(root, "content"));
  assert.ok(catalog.paths.length >= 7);

  for (const pathEntry of catalog.paths) {
    for (const scenario of pathEntry.scenarios) {
      assert.ok(scenario.labs.length > 0, `${pathEntry.id}/${scenario.id} must have labs`);
      for (const lab of scenario.labs) {
        assert.ok(
          VALID_INSPECTOR_SERVICES.has(lab.inspector?.service),
          `${lab.id} uses unknown inspector.service=${lab.inspector?.service}`,
        );
        assert.ok(lab.checks.length > 0, `${lab.id} must have at least one check`);
        assert.ok(lab.brief.trim().length > 0, `${lab.id} must have a brief`);

        const starterTf = fs.readFileSync(path.join(lab.starterDir, "main.tf"), "utf8");
        const solutionTf = fs.readFileSync(path.join(lab.dir, "solution", "main.tf"), "utf8");
        assert.notEqual(starterTf, solutionTf, `${lab.id} starter and solution main.tf must differ`);

        if (lab.mode === "guided") {
          assert.ok(lab.steps.trim().length > 0, `${lab.id} guided lab needs steps.md`);
          assert.ok(lab.references.length > 0, `${lab.id} guided lab needs references`);
        } else if (lab.mode === "challenge") {
          assert.equal(lab.steps, "", `${lab.id} challenge lab must not have steps`);
          assert.deepEqual(lab.references, [], `${lab.id} challenge lab must not have references`);
          assert.equal(lab.seed, null, `${lab.id} challenge lab must not have seed`);
          assert.doesNotMatch(lab.brief, /main\.tf|aws_[a-z0-9_]+/, `${lab.id} challenge brief leaks Terraform`);
          assert.doesNotMatch(lab.objective, /main\.tf|aws_[a-z0-9_]+/, `${lab.id} challenge objective leaks Terraform`);
        } else if (lab.mode === "issue") {
          assert.equal(lab.steps, "", `${lab.id} issue lab must not have steps`);
          assert.deepEqual(lab.references, [], `${lab.id} issue lab must not have references`);
        } else {
          assert.fail(`${lab.id} has invalid mode ${lab.mode}`);
        }
      }
    }
  }
});
