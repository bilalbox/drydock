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

test("state attachments sharing the bucket ID still fold into the bucket", async () => {
  const svg = await renderDiagram({ values: { root_module: { resources: [
    resource("aws_s3_bucket", "logs", { id: "logs-bucket" }),
    resource("aws_s3_bucket_versioning", "logs", { id: "logs-bucket", bucket: "logs-bucket" }),
  ] } } });
  assert.match(svg, /data-badge="aws_s3_bucket_versioning.logs"/);
});

test("module instances keep their own subnet references", async () => {
  const resources = [0, 1].flatMap(i => ["aws_subnet.a", "aws_instance.web"].map(address => ({
    address: `module.net[${i}].${address}`, mode: "managed", type: address.split(".")[0], name: address.split(".")[1],
    change: { actions: ["no-op"], before: {}, after: {} },
  })));
  const svg = await renderDiagram({ resource_changes: resources, configuration: { root_module: { module_calls: { net: { module: { resources: [
    { address: "aws_instance.web", mode: "managed", expressions: { subnet_id: { references: ["aws_subnet.a.id"] } } },
  ] } } } } } });
  const boundary = svg.indexOf('data-address="module.net[1].aws_subnet.a"');
  assert.ok(svg.indexOf('data-address="module.net[0].aws_instance.web"') < boundary);
  assert.ok(svg.indexOf('data-address="module.net[1].aws_instance.web"') > boundary);
});

test("folded drift keeps an orange dashed outline independent of action", async () => {
  const attachment = { address: "aws_s3_bucket_versioning.logs", mode: "managed", type: "aws_s3_bucket_versioning", name: "logs",
    change: { actions: ["update"], before: { versioning_configuration: "Disabled" }, after: { versioning_configuration: "Enabled" } } };
  const svg = await renderDiagram({ resource_changes: [attachment], resource_drift: [attachment], prior_state: { values: { root_module: { resources: [
    resource("aws_s3_bucket", "logs", { id: "logs-bucket" }),
    resource("aws_s3_bucket_versioning", "logs", { bucket: "logs-bucket" }),
  ] } } } });
  assert.match(svg, /data-badge="aws_s3_bucket_versioning.logs"[\s\S]*stroke="#ea580c"[^>]*stroke-dasharray/);
});

test("real toolbox state and plan render all actions and Floci drift", async () => {
  const fs = await import("node:fs");
  const state = JSON.parse(fs.readFileSync(new URL("./fixtures/real-state.json", import.meta.url), "utf8"));
  const plan = JSON.parse(fs.readFileSync(new URL("./fixtures/real-plan.json", import.meta.url), "utf8"));
  assert.ok(plan.resource_drift.some((r: { address: string }) => r.address === "aws_s3_bucket.update"));
  assert.match(await renderDiagram(state), /aws_s3_bucket.update/);
  const svg = await renderDiagram(plan);
  for (const action of ["create", "update", "delete", "replace"]) assert.match(svg, new RegExp(`data-action="${action}"`));
  assert.match(svg, /stroke-dasharray="6 4"/);
});
