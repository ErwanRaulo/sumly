import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  workspaceName,
  parseTestCounts,
  parseFailingTests,
  stripNpmNoise,
  extractFailureDetails,
  formatSeconds,
  envWithSpecReporter
} from "../src/run.mjs";

describe("workspaceName", () => {
  it("strips the workspaces/ prefix", () => {
    assert.equal(workspaceName("workspaces/utils"), "utils");
  });

  it("leaves paths without the prefix untouched", () => {
    assert.equal(workspaceName("packages/utils"), "packages/utils");
  });

  it("handles unexpected paths", () => {
    assert.equal(workspaceName(undefined), "");
    assert.equal(workspaceName(null), "");
    assert.equal(workspaceName(""), "");
  });
});

describe("parseTestCounts", () => {
  it("extracts tests/pass/fail/duration from a node:test trailer", () => {
    const output = "ℹ tests 30\nℹ pass 28\nℹ fail 2\nℹ duration_ms 126\n";
    assert.deepEqual(parseTestCounts(output), { tests: "30", pass: "28", fail: "2", durationMs: "126" });
  });

  it("returns null when no trailer is present", () => {
    assert.equal(parseTestCounts("npm error missing script: test"), null);
  });
});

describe("parseFailingTests", () => {
  it("extracts failing test names from the recap section", () => {
    const output = [
      "✖ failing tests:",
      "",
      "test at test/foo.spec.js:1:1",
      "✖ does the thing (4ms)",
      "  AssertionError [ERR_ASSERTION]"
    ].join("\n");

    assert.deepEqual(parseFailingTests(output), ["does the thing"]);
  });

  it("returns an empty array when there is no recap section", () => {
    assert.deepEqual(parseFailingTests("ℹ tests 3\nℹ pass 3\nℹ fail 0\n"), []);
  });
});

describe("stripNpmNoise", () => {
  it("drops npm warn lines", () => {
    const output = 'npm warn Unknown env config "allow-git".\nℹ tests 1\n';
    assert.equal(stripNpmNoise(output), "ℹ tests 1\n");
  });
});

describe("extractFailureDetails", () => {
  it("keeps only the failing tests recap for a structured failure", () => {
    const output = [
      "▶ suite",
      "  ✔ passing test (1ms)",
      "✔ suite (1ms)",
      "ℹ tests 1",
      "ℹ pass 0",
      "ℹ fail 1",
      "",
      "✖ failing tests:",
      "",
      "test at test/foo.spec.js:1:1",
      "✖ broken test (4ms)",
      "  AssertionError",
      "npm error Lifecycle script `test` failed"
    ].join("\n");

    const details = extractFailureDetails(output);
    assert.ok(details.includes("broken test"));
    assert.ok(!details.includes("passing test"));
    assert.ok(!details.includes("npm error"));
  });

  it("falls back to the full output when node:test can't describe the failure", () => {
    const output = [
      "SyntaxError: Identifier 'assert' has already been declared",
      "✖ failing tests:",
      "",
      "test at test/foo.spec.js:1:1",
      "✖ test/foo.spec.js (1ms)",
      "  'test failed'"
    ].join("\n");

    assert.ok(extractFailureDetails(output).includes("SyntaxError"));
  });

  it("returns the full trimmed output when there is no recap section at all", () => {
    assert.equal(extractFailureDetails("  totrim  "), "totrim");
  });
});

describe("envWithSpecReporter", () => {
  it("forces the spec reporter regardless of the child's TTY detection", () => {
    const env = envWithSpecReporter({ PATH: "/usr/bin" });

    assert.equal(env.PATH, "/usr/bin");
    assert.equal(env.NODE_OPTIONS, "--test-reporter=spec --test-reporter-destination=stdout");
  });

  it("appends to an existing NODE_OPTIONS instead of overwriting it", () => {
    const env = envWithSpecReporter({ NODE_OPTIONS: "--max-old-space-size=4096" });

    assert.equal(
      env.NODE_OPTIONS,
      "--max-old-space-size=4096 --test-reporter=spec --test-reporter-destination=stdout"
    );
  });
});

describe("formatSeconds", () => {
  it("formats milliseconds as seconds with one decimal", () => {
    assert.equal(formatSeconds(1234), "1.2s");
    assert.equal(formatSeconds(100), "0.1s");
  });

  it("formats non-numeric values as 0.0s instead of crashing or printing NaN", () => {
    assert.equal(formatSeconds(undefined), "0.0s");
    assert.equal(formatSeconds(null), "0.0s");
  });
});
