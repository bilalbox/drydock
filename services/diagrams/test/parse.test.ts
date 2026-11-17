import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { buildModel, DiagramInputError } from "../src/parse.ts";

const load = (name: string) =>
  JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

test("state: managed resources only, including child modules", () => {
  const m = buildModel(load("state.json"));
  assert.equal(m.source, "state");
  assert.deepEqual(m.nodes.map((n) => n.address).sort(), [
    "aws_s3_bucket.logs", "aws_subnet.a", "aws_vpc.main", "module.app.aws_sqs_queue.jobs[0]",
  ]);
  assert.ok(m.nodes.every((n) => n.action === "none" && !n.drifted && n.vendor === "aws"));
});

test("state: edges come from id matches in attribute values", () => {
  const m = buildModel(load("state.json"));
  assert.deepEqual(m.edges, [{ from: "aws_subnet.a", to: "aws_vpc.main" }]);
});

test("plan: actions map to create/update/delete/replace/none", () => {
  const m = buildModel(load("plan.json"));
  const action = Object.fromEntries(m.nodes.map((n) => [n.address, n.action]));
  assert.deepEqual(action, {
    "aws_vpc.main": "none",
    "aws_s3_bucket.logs": "update",
    "aws_security_group.old": "delete",
    "aws_instance.web": "replace",
    "aws_subnet.a": "create",
  });
});

test("plan: data sources are skipped", () => {
  const m = buildModel(load("plan.json"));
  assert.ok(!m.nodes.some((n) => n.address.startsWith("data.")));
});

test("plan: drift is a flag with its own attribute diff, separate from the action", () => {
  const vpc = buildModel(load("plan.json")).nodes.find((n) => n.address === "aws_vpc.main")!;
  assert.equal(vpc.action, "none");
  assert.equal(vpc.drifted, true);
  assert.deepEqual(vpc.driftChanges.map((c) => c.attr), ["tags"]);
});

test("plan: sensitive attributes are named but their values are never copied", () => {
  const bucket = buildModel(load("plan.json")).nodes.find((n) => n.address === "aws_s3_bucket.logs")!;
  const secret = bucket.changes.find((c) => c.attr === "secret")!;
  assert.equal(secret.sensitive, true);
  assert.ok(!("before" in secret) && !("after" in secret));
  assert.ok(!JSON.stringify(secret).includes("new"));
});

test("plan: unknown-after-apply attributes are flagged", () => {
  const subnet = buildModel(load("plan.json")).nodes.find((n) => n.address === "aws_subnet.a")!;
  assert.ok(subnet.changes.find((c) => c.attr === "vpc_id")?.unknownAfter);
});

test("plan: edges use configuration references, so created and deleted resources connect", () => {
  const m = buildModel(load("plan.json"));
  assert.deepEqual(m.edges.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to)), [
    { from: "aws_instance.web", to: "aws_security_group.old" },
    { from: "aws_instance.web", to: "aws_subnet.a" },
    { from: "aws_subnet.a", to: "aws_vpc.main" },
  ]);
});

test("rejects input that is not terraform JSON", () => {
  assert.throws(() => buildModel({ hello: 1 }), DiagramInputError);
  assert.throws(() => buildModel(null), DiagramInputError);
});
