export function jsonSubset(expected, actual) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) return false;
    return expected.every((item, index) => jsonSubset(item, actual[index]));
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    return Object.entries(expected).every(([key, value]) => jsonSubset(value, actual[key]));
  }
  return Object.is(expected, actual);
}

export function jsonIncludes(expected, actual) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    return expected.every((item) => actual.some((candidate) => jsonIncludes(item, candidate)));
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    return Object.entries(expected).every(([key, value]) => jsonIncludes(value, actual[key]));
  }
  return Object.is(expected, actual);
}

export async function grade(checks, runner, opts) {
  const results = [];
  for (const check of checks) {
    const result = await runner.run(check.argv, opts);
    let passed = result.exitCode === (check.expect_exit ?? 0);
    let detail = "";
    if (passed && (check.expect_json !== undefined || check.expect_json_includes !== undefined)) {
      try {
        const actual = JSON.parse(result.stdout);
        if (check.expect_json !== undefined && !jsonSubset(check.expect_json, actual)) passed = false;
        if (passed && check.expect_json_includes !== undefined && !jsonIncludes(check.expect_json_includes, actual)) {
          passed = false;
        }
        if (!passed) detail = "The emulator response did not include the expected fields.";
      } catch {
        passed = false;
        detail = "The command did not return JSON.";
      }
    }
    if (!passed && !detail) {
      detail = (result.stderr || result.stdout || "Command failed.").trim().slice(0, 2000);
    }
    results.push({
      id: check.id,
      passed,
      exitCode: result.exitCode,
      detail,
    });
  }
  return { passed: results.every((item) => item.passed), checks: results };
}
