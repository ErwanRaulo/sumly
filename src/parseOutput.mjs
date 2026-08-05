const COUNT_INDEX = 1;

const countTestsRegex = new RegExp(String.raw`ℹ tests (\d+)`);
const countPassRegex = new RegExp(String.raw`ℹ pass (\d+)`);
const countFailRegex = new RegExp(String.raw`ℹ fail (\d+)`);
const countSkippedRegex = new RegExp(String.raw`ℹ skipped (\d+)`);
const countTodoRegex = new RegExp(String.raw`ℹ todo (\d+)`);
const countCancelledRegex = new RegExp(String.raw`ℹ cancelled (\d+)`);
const countDurationRegex = new RegExp(String.raw`ℹ duration_ms (\d+)`);

const count = (regex, output) => regex.exec(output)?.[COUNT_INDEX];

// skip/todo/cancelled fall back to "0" rather than "?": unlike pass/fail, a missing
// line here is far more likely to mean "zero" than "parsing went wrong somehow".
export function parseTestCounts(output) {
  const tests = count(countTestsRegex, output);

  if (!tests) {
    return null;
  }

  return {
    tests,
    pass: count(countPassRegex, output) ?? "?",
    fail: count(countFailRegex, output) ?? "?",
    skip: count(countSkippedRegex, output) ?? "0",
    todo: count(countTodoRegex, output) ?? "0",
    cancelled: count(countCancelledRegex, output) ?? "0",
    durationMs: count(countDurationRegex, output)
  };
}

export function parseFailingTests(failureSection) {
  if (!failureSection) {
    return [];
  }

  return [...failureSection.matchAll(/^✖ (.+) \([\d.]+ms\)$/gm)].map((match) => match[1]);
}

export function stripNpmNoise(output) {
  return output.replace(/^npm warn .*\n?/gm, "");
}

export function extractFailureDetails(output, failureSection) {
  if (!failureSection) {
    return output.trim();
  }

  const details = failureSection.split(/\n(?=npm )/)[0].trim();

  return details.includes("'test failed'") ? output.trim() : details;
}
