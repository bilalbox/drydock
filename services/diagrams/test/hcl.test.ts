import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { buildConfigModel, scanBlocks } from "../src/hcl.ts";
import { renderModel } from "../src/render.ts";

const tf = `
# resource "aws_s3_bucket" "commented" {}
terraform { required_providers { aws = { source = "hashicorp/aws" } } }
locals { tags = { team = "ci" } }
resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }
resource "aws_subnet" "a" {
  vpc_id = aws_vpc.main.id // trailing comment with { brace
  tags = { Name = "a-\${aws_vpc.main.id}-}" }
}
/* resource "aws_instance" "ghost" { } */
resource "aws_iam_role" "r" {
  assume_role_policy = <<-EOT
    { "Statement": [ "}" ] }
  EOT
}
resource "aws_instance" "web" {
  subnet_id = aws_subnet.a.id
  iam_instance_profile = module.profile.name
  ami = data.aws_ami.al2.id
  depends_on = [aws_iam_role.r]
}
data "aws_ami" "al2" { most_recent = true }
module "profile" {
  source = "./profile"
  role = aws_iam_role.r.name
}
`;

test("scans top-level blocks through comments, strings, interpolations and heredocs", () => {
  const blocks = scanBlocks({ path: "main.tf", text: tf });
  assert.deepEqual(blocks.map(block => `${block.kind}:${block.type}.${block.name}`), [
    "resource:aws_vpc.main", "resource:aws_subnet.a", "resource:aws_iam_role.r", "resource:aws_instance.web", "data:aws_ami.al2", "module:module.profile",
  ]);
  assert.equal(blocks[0].location, "main.tf:5");
});

test("builds nodes and reference edges from configuration only", () => {
  const model = buildConfigModel([{ path: "main.tf", text: tf }, { path: "notes.md", text: 'resource "aws_vpc" "nope" {}' }]);
  assert.equal(model.source, "config");
  assert.deepEqual(model.nodes.map(node => node.address).sort(), ["aws_iam_role.r", "aws_instance.web", "aws_subnet.a", "aws_vpc.main", "module.profile"]);
  assert.deepEqual(model.edges.map(edge => `${edge.from}->${edge.to}`).sort(), [
    "aws_instance.web->aws_iam_role.r", "aws_instance.web->aws_subnet.a", "aws_instance.web->module.profile", "aws_subnet.a->aws_vpc.main", "module.profile->aws_iam_role.r",
  ]);
});

test("links resources across files and renders every lab solution", async () => {
  const model = buildConfigModel([
    { path: "network.tf", text: 'resource "aws_vpc" "main" {}' },
    { path: "main.tf", text: 'resource "aws_subnet" "a" { vpc_id = aws_vpc.main.id }' },
  ]);
  assert.deepEqual(model.edges, [{ from: "aws_subnet.a", to: "aws_vpc.main" }]);
  const svg = await renderModel(model);
  assert.match(svg, /data-address="aws_vpc.main"/);
  assert.match(svg, /network.tf:1/);
  assert.match(await renderModel(buildConfigModel([])), /No resources declared yet/);

  const content = path.resolve(import.meta.dirname, "../../../content");
  const solutions = fs.globSync("**/solution/*.tf", { cwd: content });
  assert.ok(solutions.length > 10);
  for (const file of solutions) {
    const config = buildConfigModel([{ path: "main.tf", text: fs.readFileSync(path.join(content, file), "utf8") }]);
    assert.ok(config.nodes.length > 0, `${file} has resources`);
    await renderModel(config);
  }
});
