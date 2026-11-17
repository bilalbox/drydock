import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDiagram } from "../src/render.ts";

const resource = (type: string, name: string, values: Record<string, unknown>) => ({
  address: `${type}.${name}`, mode: "managed", type, name, values,
});

test("renderer nests resources in their subnet and VPC and folds configuration as badges", async () => {
  const svg = await renderDiagram({ values: { root_module: { resources: [
    resource("aws_vpc", "main", { id: "vpc-123456" }),
    resource("aws_subnet", "a", { id: "subnet-123456", vpc_id: "vpc-123456" }),
    resource("aws_instance", "web", { subnet_id: "subnet-123456" }),
    resource("aws_s3_bucket", "logs", { id: "logs-bucket" }),
    resource("aws_s3_bucket_versioning", "logs", { bucket: "logs-bucket" }),
  ] } } });
  assert.match(svg, /data-address="aws_vpc.main"[\s\S]*data-address="aws_subnet.a"[\s\S]*data-address="aws_instance.web"/);
  assert.match(svg, /data-badge="aws_s3_bucket_versioning.logs"/);
  assert.doesNotMatch(svg, /data-address="aws_s3_bucket_versioning.logs"/);
  assert.match(svg, /data-icon="generic-resource"/);
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test("plan renderer shows ghosts, independent drift, redacted changes and escaped labels", async () => {
  const fixture = JSON.parse((await import("node:fs")).readFileSync(new URL("./fixtures/plan.json", import.meta.url), "utf8"));
  fixture.prior_state.values.root_module.resources.find((r: { type: string }) => r.type === "aws_s3_bucket").name = '<script>alert("x")</script>';
  const svg = await renderDiagram(fixture);
  for (const action of ["create", "update", "delete", "replace"]) assert.match(svg, new RegExp(`data-action="${action}"`));
  assert.match(svg, /delete · prior state/);
  assert.match(svg, /stroke-dasharray="6 4"/);
  assert.match(svg, /\[redacted\]/);
  assert.doesNotMatch(svg, /<script>|old-secret|new-secret/);
  assert.match(svg, /&lt;script&gt;/);
});

test("renderer accepts empty Terraform state and no-change plans", async () => {
  assert.match(await renderDiagram({ format_version: "1.0" }), /No managed resources/);
  assert.match(await renderDiagram({ format_version: "1.2", planned_values: { root_module: { resources: [resource("aws_s3_bucket", "unchanged", {})] } } }), /aws_s3_bucket.unchanged/);
});

test("indexed references group each instance with its own subnet, including module instances", async () => {
  const subnet = (name: string) => resource("aws_subnet", name, {});
  const state = [subnet('a[0]'), subnet('a[1]'), resource("aws_instance", 'web[0]', {}), resource("aws_instance", 'web[1]', {})];
  const svg = await renderDiagram({ resource_changes: state.map(r => ({ ...r, change: { actions: ["no-op"], before: {}, after: {} } })),
    configuration: { root_module: { resources: [0, 1].map(i => ({ address: `aws_instance.web[${i}]`, mode: "managed", expressions: { subnet_id: { references: [`aws_subnet.a[${i}].id`] } } })) } } });
  // Each subnet's SVG group must contain its own instance, not its sibling instance.
  const first = svg.indexOf('data-address="aws_subnet.a[0]"');
  const second = svg.indexOf('data-address="aws_subnet.a[1]"');
  assert.ok(first >= 0 && second > first);
  assert.ok(svg.indexOf('data-address="aws_instance.web[0]"') < second);
  assert.ok(svg.indexOf('data-address="aws_instance.web[1]"') > second);
});

test("standalone SVG has a stable layout for unmapped resources", async t => {
  t.assert.snapshot(await renderDiagram({ values: { root_module: { resources: [
    resource("custom_resource", "one", { id: "first-resource" }),
    resource("custom_resource", "two", { parent: "first-resource" }),
  ] } } }));
});
