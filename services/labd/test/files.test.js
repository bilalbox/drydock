import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { GENERATED_HEADER } from "../src/bundles/common.js";
import { listWorkspace, readWorkspaceFile, writeWorkspaceFile } from "../src/workspaceFiles.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drydock-files-"));
  fs.writeFileSync(path.join(root, "main.tf"), "# learner\n");
  fs.writeFileSync(path.join(root, "provider.tf"), `${GENERATED_HEADER}provider "aws" {}\n`);
  fs.mkdirSync(path.join(root, "modules", "bucket"), { recursive: true });
  fs.writeFileSync(path.join(root, "modules", "bucket", "main.tf"), "# nested\n");
  fs.mkdirSync(path.join(root, ".aws"));
  fs.writeFileSync(path.join(root, ".aws", "credentials"), "secret\n");
  fs.mkdirSync(path.join(root, ".terraform"));
  fs.writeFileSync(path.join(root, ".terraform", "plugin"), "binary");
  return root;
}

test("workspace tree shows terraform files and skips tooling directories", () => {
  const root = fixture();
  const tree = listWorkspace(root);
  const names = tree.map((node) => node.name);
  assert.deepEqual(names, ["modules", "main.tf", "provider.tf"]);
  assert.equal(tree[0].children[0].children[0].path, "modules/bucket/main.tf");
});

test("the editor can save main.tf and cannot overwrite a generated file or escape the workspace", () => {
  const root = fixture();
  assert.equal(readWorkspaceFile(root, "main.tf").readOnly, false);
  writeWorkspaceFile(root, "main.tf", "resource \"aws_s3_bucket\" \"artifacts\" {}\n");
  assert.match(readWorkspaceFile(root, "main.tf").text, /aws_s3_bucket/);
  assert.equal(readWorkspaceFile(root, "provider.tf").readOnly, true);
  assert.throws(() => writeWorkspaceFile(root, "provider.tf", "nope\n"), /restored on reset/);
  assert.throws(() => readWorkspaceFile(root, "../secret"), /outside the workspace/);
  assert.throws(() => readWorkspaceFile(root, ".aws/credentials"), /not part of the lab workspace/);
  const outside = path.join(root, "link");
  fs.symlinkSync(path.dirname(root), outside);
  assert.throws(() => readWorkspaceFile(root, "link/secret"), /outside the workspace|not text|not in the workspace/);
});
