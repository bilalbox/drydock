import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PROGRESS_KEY,
  markStarted,
  readProgress,
  recordAttempt,
  writeProgress,
} from "../src/lib/progress.js";

const labId = "artifact-storage/northline/private-artifact-bucket";
const otherId = "artifact-storage/northline/expire-old-builds";
const now = new Date("2026-11-17T06:00:00.000Z");

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

function blockingStorage() {
  return {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
}

test("each storage keeps an independent progress record", () => {
  const alice = memoryStorage();
  const bob = memoryStorage();
  writeProgress(alice, markStarted({}, labId));
  writeProgress(bob, recordAttempt({}, otherId, { passed: true }, now));

  assert.equal(readProgress(alice)[labId].status, "in_progress");
  assert.equal(readProgress(alice)[otherId], undefined);
  assert.equal(readProgress(bob)[otherId].status, "passed");
  assert.equal(readProgress(bob)[labId], undefined);
});

test("starting a lab records in progress and does not downgrade a pass", () => {
  const started = markStarted({}, labId);
  assert.deepEqual(started[labId], { status: "in_progress", attempts: 0 });

  const passed = recordAttempt(started, labId, { passed: true }, now);
  assert.equal(markStarted(passed, labId), passed);
  assert.equal(passed[labId].status, "passed");
  assert.equal(passed[labId].attempts, 1);
  assert.equal(passed[labId].passedAt, now.toISOString());
});

test("a failed check after a pass returns the lab to in progress and keeps the pass time", () => {
  const passed = recordAttempt({}, labId, { passed: true }, now);
  const later = new Date("2026-11-17T07:00:00.000Z");
  const failed = recordAttempt(passed, labId, { passed: false }, later);
  assert.equal(failed[labId].status, "in_progress");
  assert.equal(failed[labId].attempts, 2);
  assert.equal(failed[labId].lastAttemptAt, later.toISOString());
  assert.equal(failed[labId].passedAt, now.toISOString());
  assert.equal(passed[labId].status, "passed");
});

test("unreadable storage and malformed records load as empty", () => {
  assert.deepEqual(readProgress(memoryStorage()), {});
  assert.deepEqual(readProgress(memoryStorage({ [PROGRESS_KEY]: "{" })), {});
  assert.deepEqual(readProgress(memoryStorage({ [PROGRESS_KEY]: "[]" })), {});
  assert.deepEqual(
    readProgress(memoryStorage({ [PROGRESS_KEY]: JSON.stringify({ [labId]: { status: "nope", attempts: 3 } }) })),
    {},
  );
  assert.equal(writeProgress(blockingStorage(), {}), false);
  assert.deepEqual(readProgress(blockingStorage()), {});
});
