import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseTestCounts, parseFailingTests, stripNpmNoise, extractFailureDetails } from "../src/parseOutput.mjs";

describe("parseTestCounts", () => {
  it("extracts tests/pass/fail/duration from a node:test trailer", () => {
    const output = "ℹ tests 30\nℹ pass 28\nℹ fail 2\nℹ duration_ms 126\n";
    assert.deepEqual(parseTestCounts(output), { tests: "30", pass: "28", fail: "2", skip: "0", todo: "0", cancelled: "0", durationMs: "126" });
  });

  it("extracts skipped tests when node:test reports some", () => {
    const output = "ℹ tests 30\nℹ pass 27\nℹ fail 2\nℹ skipped 1\nℹ duration_ms 126\n";
    assert.deepEqual(parseTestCounts(output), { tests: "30", pass: "27", fail: "2", skip: "1", todo: "0", cancelled: "0", durationMs: "126" });
  });

  it("extracts todo and cancelled tests when node:test reports some", () => {
    const output = "ℹ tests 30\nℹ pass 27\nℹ fail 0\nℹ cancelled 1\nℹ skipped 1\nℹ todo 1\nℹ duration_ms 126\n";
    assert.deepEqual(parseTestCounts(output), { tests: "30", pass: "27", fail: "0", skip: "1", todo: "1", cancelled: "1", durationMs: "126" });
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
