import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { AWS_ICONS, awsIconFiles } from "../src/icons/aws.ts";

const contentDir = path.resolve(import.meta.dirname, "../../../content");

function* tfFiles(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* tfFiles(p);
    else if (e.name.endsWith(".tf")) yield p;
  }
}

test("every aws resource type used in lab content has an icon mapping", () => {
  const used = new Set<string>();
  for (const f of tfFiles(contentDir))
    for (const m of fs.readFileSync(f, "utf8").matchAll(/^resource\s+"(aws_[a-z0-9_]+)"/gm)) used.add(m[1]);
  assert.ok(used.size > 20, "expected to find lab resource types");
  const unmapped = [...used].filter((t) => !(t in AWS_ICONS)).sort();
  assert.deepEqual(unmapped, []);
});

test("mapped icon names are well formed and groups are only on vpc and subnet", () => {
  for (const [type, e] of Object.entries(AWS_ICONS)) {
    assert.match(type, /^aws_[a-z0-9_]+$/);
    assert.match(e.icon, /^(Arch|Res)_[A-Za-z0-9-]+(_[A-Za-z0-9-]+)?$/, type);
    if (e.group) assert.ok(type === "aws_vpc" || type === "aws_subnet");
  }
});

// Runs only after `npm run icons`; confirms the fetched pack matches the map.
test("fetched icon files exist for the whole map", { skip: !fs.existsSync(new URL("../assets/aws", import.meta.url)) }, () => {
  for (const { stem } of awsIconFiles())
    assert.ok(fs.existsSync(new URL(`../assets/aws/${stem}.svg`, import.meta.url)), stem);
});
