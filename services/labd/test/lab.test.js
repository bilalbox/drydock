import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { getLab, loadCatalog, publicLab, seedArgv } from "../src/catalog.js";
import { materializeAws } from "../src/bundles/aws.js";
import { materializeAzure } from "../src/bundles/azure.js";
import { materializeGcp } from "../src/bundles/gcp.js";
import { materializeOci } from "../src/bundles/oci.js";
import { AWS_ENDPOINT_KEYS } from "../src/bundles/awsEndpoints.js";
import { grade, jsonIncludes, jsonSubset } from "../src/grader.js";
import { materializeWorkspace } from "../src/workspace.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const lock = JSON.parse(fs.readFileSync(path.join(root, "providers.lock.json"), "utf8"));
const labId = "artifact-storage/northline/private-artifact-bucket";

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
  materializeWorkspace({ lab, dest, lock });
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

test("current-release-gone drifts the live bucket without telling the learner how", () => {
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
  const commands = seedArgv(lab);
  assert.deepEqual(commands[0], ["terraform", "apply", "-auto-approve", "-input=false", "-no-color"]);
  const drift = JSON.parse(commands[1][commands[1].length - 1]);
  assert.equal(drift.Rules[0].Expiration.Days, 30);
  assert.equal(drift.Rules[0].NoncurrentVersionExpiration, undefined);
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "drydock-"));
  materializeWorkspace({ lab, dest, lock });
  const starter = fs.readFileSync(path.join(dest, "main.tf"), "utf8");
  assert.match(starter, /aws_s3_bucket_versioning/);
  assert.doesNotMatch(starter, /lifecycle|Expiration|noncurrent_days/);
  assert.equal(fs.existsSync(path.join(dest, "seed.yaml")), false);
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
  materializeWorkspace({ lab, dest, lock });
  const starter = fs.readFileSync(path.join(dest, "main.tf"), "utf8");
  const solution = fs.readFileSync(path.join(lab.dir, "solution", "main.tf"), "utf8");
  assert.notEqual(starter, solution);
  assert.doesNotMatch(starter, /northline-artifacts/);
  assert.match(fs.readFileSync(path.join(dest, "provider.tf"), "utf8"), /http:\/\/floci:4566/);
  assert.match(fs.readFileSync(path.join(dest, ".drydock", "env"), "utf8"), /AWS_ENDPOINT_URL='http:\/\/floci:4566'/);
});

test("aws bundle points every documented endpoint at the emulator", () => {
  const { files, env } = materializeAws({ lock });
  const hcl = files["provider.tf"];
  assert.match(hcl, /s3_use_path_style\s+=\s+true/);
  assert.match(hcl, /access_key\s+=\s+"test"/);
  assert.equal(env.AWS_ENDPOINT_URL, "http://floci:4566");
  for (const key of ["s3", "iam", "sts", "dynamodb", "sfn"]) {
    assert.match(hcl, new RegExp(`\\n\\s+${key} = "http://floci:4566"`));
  }
  const assigned = hcl.match(/= "http:\/\/floci:4566"/g) ?? [];
  assert.equal(assigned.length, AWS_ENDPOINT_KEYS.length);
  assert.equal(new Set(AWS_ENDPOINT_KEYS).size, AWS_ENDPOINT_KEYS.length);
  assert.equal(AWS_ENDPOINT_KEYS.includes("states"), false);
  for (const key of AWS_ENDPOINT_KEYS) {
    assert.match(key, /^[A-Za-z_][A-Za-z0-9_]*$/);
  }
});

test("azure bundle uses the emulator metadata host and trusts its CA", () => {
  const workspace = "/workspaces/example";
  const { files, env, prepare } = materializeAzure({ workspace, lock });
  assert.match(files["provider.tf"], /metadata_host\s+=\s+"floci-az:4577"/);
  assert.match(files["provider.tf"], /use_cli\s+=\s+false/);
  assert.doesNotMatch(files["provider.tf"], /environment\s+=/);
  assert.equal(env.SSL_CERT_FILE, "/workspaces/example/.drydock/ca-bundle.crt");
  assert.deepEqual(prepare, [["/opt/drydock/bin/drydock-prepare-azure", workspace]]);
});

test("gcp bundle uses the floci-gcp REST paths", () => {
  const { files, env } = materializeGcp({ lab: { services: [] }, lock });
  const hcl = files["provider.tf"];
  assert.match(hcl, /storage_custom_endpoint\s+=\s+"http:\/\/floci-gcp:4588\/storage\/v1\/"/);
  assert.match(hcl, /pubsub_custom_endpoint\s+=\s+"http:\/\/floci-gcp:4588\/v1\/"/);
  assert.match(hcl, /container_custom_endpoint\s+=\s+"http:\/\/container\.floci-gcp:4588\/"/);
  assert.equal(env.GOOGLE_OAUTH_ACCESS_TOKEN, "fake-token");
  assert.equal(env.CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE, "http://floci-gcp:4588/");
  assert.equal(env.CLOUDSDK_API_ENDPOINT_OVERRIDES_CONTAINER, "http://floci-gcp:4588/container/");
});

test("oci bundle sets the provider host-override environment", () => {
  const { files, env } = materializeOci({ lab: { services: [] }, lock });
  assert.match(files["provider.tf"], /private_key_path\s+=\s+"\/opt\/drydock\/oci-dummy.pem"/);
  assert.match(env.CLIENT_HOST_OVERRIDES, /oci_identity\.IdentityClient=http:\/\/floci-oci:4599/);
  assert.match(env.CLIENT_HOST_OVERRIDES, /oci_object_storage\.ObjectStorageClient=http:\/\/floci-oci:4599/);
});

test("provider mirror versions match the lock file", () => {
  const mirror = fs.readFileSync(path.join(root, "services/toolbox/mirror.tf"), "utf8");
  for (const provider of Object.values(lock.providers)) {
    assert.match(mirror, new RegExp(`source\\s+=\\s+"${provider.source}"`));
    assert.match(mirror, new RegExp(`version\\s+=\\s+"${provider.version}"`));
  }
});

test("json subset allows extra fields and rejects a missing one", () => {
  assert.equal(jsonSubset({ Status: "Enabled" }, { Status: "Enabled", MFADelete: "Disabled" }), true);
  assert.equal(jsonSubset({ Status: "Enabled" }, { Status: "Suspended" }), false);
});

test("json includes matches one lifecycle rule against both retention requirements", () => {
  const expected = {
    Rules: [
      { Status: "Enabled", NoncurrentVersionExpiration: { NoncurrentDays: 30 } },
      { Status: "Enabled", AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } },
    ],
  };
  const combined = {
    Rules: [
      {
        ID: "expire-old-builds",
        Status: "Enabled",
        Filter: { Prefix: "" },
        NoncurrentVersionExpiration: { NoncurrentDays: 30 },
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
      },
    ],
  };
  assert.equal(jsonIncludes(expected, combined), true);
  assert.equal(
    jsonIncludes(expected, {
      Rules: [{ Status: "Enabled", Expiration: { Days: 30 }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } }],
    }),
    false,
  );
});

test("grader passes the artifact checks only when the emulator agrees", async () => {
  const { lab } = getLab(loadCatalog(path.join(root, "content")), labId);
  const runner = {
    async run(argv) {
      const command = argv[2];
      if (command === "head-bucket") return { exitCode: 0, stdout: "", stderr: "" };
      if (command === "get-bucket-versioning") {
        return { exitCode: 0, stdout: JSON.stringify({ Status: "Enabled", MFADelete: "Disabled" }), stderr: "" };
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
    },
  };
  const passed = await grade(lab.checks, runner, { cwd: "/opt/drydock/checks", env: {} });
  assert.equal(passed.passed, true);

  const failed = await grade(lab.checks, {
    async run(argv) {
      if (argv[2] === "get-bucket-versioning") {
        return { exitCode: 0, stdout: JSON.stringify({ Status: "Suspended" }), stderr: "" };
      }
      return runner.run(argv);
    },
  }, { cwd: "/opt/drydock/checks", env: {} });
  assert.equal(failed.passed, false);
  assert.equal(failed.checks.find((check) => check.id === "versioning-enabled").passed, false);
});

test("grader accepts retained noncurrent builds and rejects expiring the current object", async () => {
  const { lab } = getLab(loadCatalog(path.join(root, "content")), "artifact-storage/northline/expire-old-builds");
  const lifecycle = {
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
  const runner = {
    async run(argv) {
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
    },
  };
  const passed = await grade(lab.checks, runner, { cwd: "/opt/drydock/checks", env: {} });
  assert.equal(passed.passed, true);

  const expiredCurrent = await grade(lab.checks, {
    async run(argv) {
      if (argv[2] !== "get-bucket-lifecycle-configuration") return runner.run(argv);
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          Rules: [
            {
              Status: "Enabled",
              Expiration: { Days: 30 },
              AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
            },
          ],
        }),
        stderr: "",
      };
    },
  }, { cwd: "/opt/drydock/checks", env: {} });
  assert.equal(expiredCurrent.passed, false);
  assert.equal(expiredCurrent.checks.find((check) => check.id === "old-versions-expire").passed, false);
});
