/**
 * Downloads the official AWS Architecture Icons pack and extracts only the
 * icons we map into assets/aws/. Run: npm run icons
 *
 * The pack is published by AWS at https://aws.amazon.com/architecture/icons/
 * under AWS's own terms, which we do not redistribute: assets/ is gitignored
 * and rebuilt from the vendor source. AWS rotates the pack URL on each release;
 * update PACK_URL from that page when this fails with a 404.
 */
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { awsIconFiles } from "../src/icons/aws.ts";

const PACK_URL =
  "https://d1.awsstatic.com/onedam/marketing-channels/website/public/shared/architecture-icon-release/Icon-package_07312026.5846e92413caa21490223536cc97f1269e44fa92.zip";
const OUT = path.resolve(import.meta.dirname, "../assets/aws");

const res = await fetch(PACK_URL);
if (!res.ok) throw new Error(`download failed: ${res.status} ${PACK_URL}`);
const files = unzipSync(new Uint8Array(await res.arrayBuffer()), {
  filter: (f) => f.name.endsWith(".svg") && !f.name.startsWith("__MACOSX"),
});

const bySuffix = new Map<string, Uint8Array>();
for (const [name, data] of Object.entries(files)) bySuffix.set(path.basename(name), data);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const missing: string[] = [];
for (const { stem, kind } of awsIconFiles()) {
  const size = kind === "group" ? 32 : 48;
  const data = bySuffix.get(`${stem}_${size}.svg`);
  if (!data) {
    missing.push(`${stem}_${size}.svg`);
    continue;
  }
  fs.writeFileSync(path.join(OUT, `${stem}.svg`), data);
}
if (missing.length) {
  console.error(`missing from pack:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
fs.writeFileSync(
  path.join(OUT, "SOURCE.txt"),
  `Fetched from ${PACK_URL}\nAWS Architecture Icons. Use is governed by AWS's terms at https://aws.amazon.com/architecture/icons/\n`,
);
console.log(`wrote ${awsIconFiles().length} icons to ${OUT}`);
