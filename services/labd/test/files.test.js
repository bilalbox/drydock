import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createWorkspace,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "../src/workspace.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const lock = JSON.parse(fs.readFileSync(path.join(root, "providers.lock.json"), "utf8"));

function makeStarter(files) {
  const starterDir = fs.mkdtempSync(path.join(os.tmpdir(), "drydock-starter-"));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(starterDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return starterDir;
}

test("workspace tree shows terraform files, hides dotfiles/tooling dirs, and protects generated files", () => {
  const starterDir = makeStarter({
    "main.tf": "# learner\n",
    "modules/bucket/main.tf": "# nested\n",
  });
  const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "drydock-ws-")), "active");
  const { env } = createWorkspace({
    lab: { clouds: ["aws"], starterDir },
    dest,
    lock,
  });

  fs.mkdirSync(path.join(dest, ".terraform"), { recursive: true });
  fs.writeFileSync(path.join(dest, ".terraform", "plugin"), "binary");

  assert.equal(env.HOME, dest);
  assert.match(fs.readFileSync(path.join(dest, ".drydock", "env"), "utf8"), new RegExp(`export HOME='${dest}'`));
  assert.match(fs.readFileSync(path.join(dest, ".drydock", "docker.env"), "utf8"), new RegExp(`HOME=${dest}`));

  const tree = listWorkspaceFiles(dest);
  assert.deepEqual(
    tree.map((node) => node.name),
    ["modules", "main.tf", "provider.tf"],
  );
  assert.equal(tree[0].children[0].children[0].path, "modules/bucket/main.tf");

  assert.equal(readWorkspaceFile(dest, "main.tf").readOnly, false);
  writeWorkspaceFile(dest, "main.tf", 'resource "aws_s3_bucket" "artifacts" {}\n');
  assert.match(readWorkspaceFile(dest, "main.tf").text, /aws_s3_bucket/);

  assert.equal(readWorkspaceFile(dest, "provider.tf").readOnly, true);
  assert.throws(
    () => writeWorkspaceFile(dest, "provider.tf", "nope\n"),
    (err) => err.code === "READ_ONLY" && /restored on reset/.test(err.message),
  );
  assert.throws(() => readWorkspaceFile(dest, ".bashrc"), (err) => err.code === "NOT_FOUND");
  assert.throws(() => readWorkspaceFile(dest, ".aws/credentials"), (err) => err.code === "NOT_FOUND");
  assert.throws(() => readWorkspaceFile(dest, "../secret"), (err) => err.code === "INVALID_PATH");

  fs.symlinkSync(path.dirname(dest), path.join(dest, "link"));
  assert.throws(
    () => readWorkspaceFile(dest, "link/secret"),
    (err) => err.code === "INVALID_PATH" || err.code === "NOT_FOUND",
  );
});

test("workspace materializes aws, azure, gcp, oci, and multi-cloud provider bundles with one header", () => {
  const starterDir = makeStarter({ "main.tf": "# empty\n" });

  const awsDest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "drydock-aws-")), "ws");
  const aws = createWorkspace({ lab: { clouds: ["aws"], starterDir }, dest: awsDest, lock });
  const awsHcl = readWorkspaceFile(awsDest, "provider.tf").text;
  assert.match(awsHcl, /s3_use_path_style\s+=\s+true/);
  assert.match(awsHcl, /access_key\s+=\s+"test"/);
  assert.equal(aws.env.AWS_ENDPOINT_URL, "http://floci:4566");
  assert.equal(aws.env.AWS_CONFIG_FILE, `${awsDest}/.aws/config`);
  for (const key of ["s3", "iam", "sts", "dynamodb", "sfn"]) {
    assert.match(awsHcl, new RegExp(`\\n\\s+${key} = "http://floci:4566"`));
  }
  assert.equal(awsHcl.includes("states ="), false);

  const azDest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "drydock-az-")), "ws");
  const az = createWorkspace({ lab: { clouds: ["azure"], starterDir }, dest: azDest, lock });
  const azHcl = readWorkspaceFile(azDest, "provider.tf").text;
  assert.match(azHcl, /metadata_host\s+=\s+"floci-az:4577"/);
  assert.match(azHcl, /use_cli\s+=\s+false/);
  assert.doesNotMatch(azHcl, /environment\s+=/);
  assert.equal(az.env.SSL_CERT_FILE, `${azDest}/.drydock/ca-bundle.crt`);
  assert.deepEqual(az.prepare, [["/opt/drydock/bin/drydock-prepare-azure", azDest]]);

  const gcpDest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "drydock-gcp-")), "ws");
  const gcp = createWorkspace({ lab: { clouds: ["gcp"], services: [], starterDir }, dest: gcpDest, lock });
  const gcpHcl = readWorkspaceFile(gcpDest, "provider.tf").text;
  assert.match(gcpHcl, /storage_custom_endpoint\s+=\s+"http:\/\/floci-gcp:4588\/storage\/v1\/"/);
  assert.match(gcpHcl, /container_custom_endpoint\s+=\s+"http:\/\/container\.floci-gcp:4588\/"/);
  assert.equal(gcp.env.GOOGLE_OAUTH_ACCESS_TOKEN, "fake-token");
  assert.equal(gcp.env.CLOUDSDK_API_ENDPOINT_OVERRIDES_CONTAINER, "http://floci-gcp:4588/container/");

  const ociDest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "drydock-oci-")), "ws");
  const oci = createWorkspace({ lab: { clouds: ["oci"], services: [], starterDir }, dest: ociDest, lock });
  const ociHcl = readWorkspaceFile(ociDest, "provider.tf").text;
  assert.match(ociHcl, /private_key_path\s+=\s+"\/opt\/drydock\/oci-dummy.pem"/);
  assert.match(oci.env.CLIENT_HOST_OVERRIDES, /oci_identity\.IdentityClient=http:\/\/floci-oci:4599/);

  const multiDest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "drydock-multi-")), "ws");
  createWorkspace({ lab: { clouds: ["aws", "gcp"], starterDir }, dest: multiDest, lock });
  const multiHcl = readWorkspaceFile(multiDest, "provider.tf").text;
  assert.equal(multiHcl.match(/# Generated by Drydock/g)?.length, 1);
  assert.match(multiHcl, /provider "aws"/);
  assert.match(multiHcl, /provider "google"/);
});
