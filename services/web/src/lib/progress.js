/** Per-browser lab progress. The key is origin-scoped, so each visitor keeps a separate record. */
export const PROGRESS_KEY = "drydock.progress";

const STATUSES = new Set(["passed", "in_progress"]);

/** Reads progress from storage. Unreadable or malformed data becomes an empty record. */
export function readProgress(storage) {
  try {
    const text = storage.getItem(PROGRESS_KEY);
    if (!text) return {};
    return normalize(JSON.parse(text));
  } catch {
    return {};
  }
}

/** Writes progress. Returns false when storage rejects the write; the caller keeps the in-memory record. */
export function writeProgress(storage, progress) {
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

/** Marks a lab in progress. A passed lab stays passed. */
export function markStarted(progress, labId) {
  const current = progress[labId] ?? { status: "not_started", attempts: 0 };
  if (current.status === "passed") return progress;
  return { ...progress, [labId]: { ...current, status: "in_progress" } };
}

/** Records one Check. A later failure moves a passed lab back to in progress and keeps the earlier pass time. */
export function recordAttempt(progress, labId, attempt, now = new Date()) {
  const current = progress[labId] ?? { status: "in_progress", attempts: 0 };
  const lastAttemptAt = now.toISOString();
  const next = {
    status: attempt?.passed === true ? "passed" : "in_progress",
    attempts: (current.attempts ?? 0) + 1,
    lastAttemptAt,
  };
  if (current.passedAt) next.passedAt = current.passedAt;
  if (next.status === "passed") next.passedAt = lastAttemptAt;
  return { ...progress, [labId]: next };
}

function normalize(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const progress = {};
  for (const [labId, entry] of Object.entries(parsed)) {
    if (!labId || !entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    if (!STATUSES.has(entry.status)) continue;
    const attempts = Number.isFinite(entry.attempts) && entry.attempts >= 0 ? Math.floor(entry.attempts) : 0;
    const next = { status: entry.status, attempts };
    if (typeof entry.lastAttemptAt === "string") next.lastAttemptAt = entry.lastAttemptAt;
    if (typeof entry.passedAt === "string") next.passedAt = entry.passedAt;
    progress[labId] = next;
  }
  return progress;
}
