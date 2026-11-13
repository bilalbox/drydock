import fs from "node:fs";
import path from "node:path";

export function loadProgress(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

export function markStarted(file, labId) {
  const progress = loadProgress(file);
  const current = progress[labId] ?? { status: "not_started", attempts: 0 };
  if (current.status !== "passed") current.status = "in_progress";
  progress[labId] = current;
  write(file, progress);
  return progress;
}

export function recordAttempt(file, labId, attempt) {
  const progress = loadProgress(file);
  const current = progress[labId] ?? { status: "in_progress", attempts: 0 };
  current.attempts = (current.attempts ?? 0) + 1;
  current.status = attempt.passed ? "passed" : "in_progress";
  current.lastAttemptAt = new Date().toISOString();
  if (attempt.passed) current.passedAt = current.lastAttemptAt;
  progress[labId] = current;
  write(file, progress);
  return progress;
}

function write(file, progress) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(progress, null, 2)}\n`);
}
