import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  workspaceName,
  parseTestCounts,
  parseFailingTests,
  stripNpmNoise,
  extractFailureDetails,
  formatSeconds,
  envWithSpecReporter,
  ciGroupSyntax,
  ciGroupTitle
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

  it("also registers a junit reporter when a destination path is given", () => {
    const env = envWithSpecReporter({}, "/tmp/report.xml");

    assert.equal(
      env.NODE_OPTIONS,
      "--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=/tmp/report.xml"
    );
  });

  it("strips NODE_TEST_CONTEXT so a nested node:test workspace never sees itself as a child run", () => {
    const env = envWithSpecReporter({ PATH: "/usr/bin", NODE_TEST_CONTEXT: "child-v8" });

    assert.equal(env.NODE_TEST_CONTEXT, undefined);
    assert.equal(env.PATH, "/usr/bin");
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

describe("ciGroupSyntax", () => {
  it("returns GitHub Actions ::group:: syntax when GITHUB_ACTIONS=true", () => {
    const group = ciGroupSyntax({ GITHUB_ACTIONS: "true" });

    assert.equal(group.start("✓ utils 1.1s"), "::group::✓ utils 1.1s");
    assert.equal(group.end(), "::endgroup::");
  });

  it("returns null outside of GitHub Actions, so callers fall back to plain output", () => {
    assert.equal(ciGroupSyntax({}), null);
    assert.equal(ciGroupSyntax({ GITHUB_ACTIONS: "false" }), null);
    assert.equal(ciGroupSyntax({ GITLAB_CI: "true" }), null);
  });
});

describe("ciGroupTitle", () => {
  it("marks a passing workspace with a checkmark and its test counts", () => {
    const title = ciGroupTitle("utils", { exitCode: 0, durationMs: 1100, counts: { pass: "9", tests: "9" } });

    assert.equal(title, "✓ utils 1.1s (9/9 tests)");
  });

  it("marks a failing workspace with a cross, still including its test counts", () => {
    const title = ciGroupTitle("flags", { exitCode: 1, durationMs: 1300, counts: { pass: "8", tests: "9" } });

    assert.equal(title, "✗ flags 1.3s (8/9 tests)");
  });

  it("omits the counts label when node:test own counts couldn't be parsed", () => {
    const title = ciGroupTitle("broken", { exitCode: 1, durationMs: 400, counts: null });

    assert.equal(title, "✗ broken 0.4s");
  });
});
