import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { envWithSpecReporter } from "../src/run.mjs";

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
