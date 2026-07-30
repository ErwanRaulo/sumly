const COUNT_INDEX = 1;
const count = (target, output) => new RegExp(String.raw`ℹ ${target} (\d+)`).exec(output)?.[COUNT_INDEX];

export function parseTestCounts(output) {
  const tests = count("tests", output);

  if (!tests) {
    return null;
  }

  return {
    tests,
    pass: count("pass", output) ?? "?",
    fail: count("fail", output) ?? "?",
    durationMs: count("duration_ms", output)
  };
}

export function parseFailingTests(output) {
  const [, section] = output.split("✖ failing tests:");
  if (!section) {
    return [];
  }

  return [...section.matchAll(/^✖ (.+) \([\d.]+ms\)$/gm)].map((match) => match[1]);
}

export function stripNpmNoise(output) {
  return output.replace(/^npm warn .*\n?/gm, "");
}

export function extractFailureDetails(output) {
  const [, section] = output.split("✖ failing tests:");
  if (!section) {
    return output.trim();
  }

  const details = section.split(/\n(?=npm )/)[0].trim();

  return details.includes("'test failed'") ? output.trim() : details;
}
