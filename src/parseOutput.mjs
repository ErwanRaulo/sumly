const COUNT_INDEX = 1;
const count = (target, output) => new RegExp(String.raw`ℹ ${target} (\d+)`).exec(output)?.[COUNT_INDEX];

// skip/todo/cancelled fall back to "0" rather than "?": unlike pass/fail, a missing
// line here is far more likely to mean "zero" than "parsing went wrong somehow".
export function parseTestCounts(output) {
  const tests = count("tests", output);

  if (!tests) {
    return null;
  }

  return {
    tests,
    pass: count("pass", output) ?? "?",
    fail: count("fail", output) ?? "?",
    skip: count("skipped", output) ?? "0",
    todo: count("todo", output) ?? "0",
    cancelled: count("cancelled", output) ?? "0",
    durationMs: count("duration_ms", output)
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
