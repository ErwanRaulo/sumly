import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { assertWellFormedXml } from "./xmlAssertions.mjs";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "sumlyzer.mjs");

const TEST_PATH = path.join(ROOT, "test");
const PROJECT_WITH_WORKSPACES = path.join(TEST_PATH, "workspaces-fixture");
const PROJECT_WITHOUT_WORKSPACES = path.join(TEST_PATH, "no-workspaces-fixture");
const RUN_FIXTURE = path.join(TEST_PATH, "run-fixture");
const NO_ELIGIBLE_FIXTURE = path.join(TEST_PATH, "no-eligible-fixture");
const EMPTY_WORKSPACES_FIXTURE = path.join(TEST_PATH, "empty-workspaces-fixture");
const JUNIT_FIXTURE = path.join(TEST_PATH, "junit-fixture");

async function runCli(args, cwd, env) {
  // Avoid suite's own CI run setting GITHUB_ACTIONS=true, which would trigger the fold markers.
  const childEnv = { ...process.env };
  delete childEnv.GITHUB_ACTIONS;
  Object.assign(childEnv, env);

  try {
    const { stdout, stderr } = await execFileAsync("node", [BIN, ...args], { cwd, env: childEnv });
    return { stdout, stderr, code: 0 };
  }
  catch (error) {
    return { stdout: error.stdout, stderr: error.stderr, code: error.code };
  }
}

describe("sumlyzer CLI behaviors", () => {
  it("--help prints usage and exits 0", async () => {
    const { stdout } = await execFileAsync("node", [BIN, "--help"], { cwd: PROJECT_WITH_WORKSPACES });

    assert.match(stdout, /sumlyzer \[options\]/);
    assert.match(stdout, /--script <name>/);
    assert.match(stdout, /--ff/);
    assert.match(stdout, /--junit <path>/);
    assert.match(stdout, /-h, --help/);
  });

  it("-h is the same as --help", async () => {
    const [full, short] = await Promise.all([
      execFileAsync("node", [BIN, "--help"], { cwd: PROJECT_WITH_WORKSPACES }),
      execFileAsync("node", [BIN, "-h"], { cwd: PROJECT_WITH_WORKSPACES })
    ]);

    assert.equal(short.stdout, full.stdout);
  });

  it("reflects --script in the help text instead of the \"test\" default", async () => {
    const { stdout } = await execFileAsync("node", [BIN, "--help", "--script", "check"], { cwd: PROJECT_WITH_WORKSPACES });

    assert.match(stdout, /"check" script/);
  });

  it("prints a friendly message for an unknown flag instead of a stack trace", async () => {
    await assert.rejects(
      execFileAsync("node", [BIN, "--unknown-flag"], { cwd: PROJECT_WITH_WORKSPACES }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /Unknown option '--unknown-flag'/);
        assert.match(error.stdout, /sumlyzer --help/);
        assert.doesNotMatch(error.stdout, /at ModuleJob|node:internal/);
        return true;
      }
    );
  });

  it("prints a friendly message if project does not have any workspaces", async () => {
    await assert.rejects(
      execFileAsync("node", [BIN], { cwd: PROJECT_WITHOUT_WORKSPACES }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /Your project does not have any workspaces./);
        assert.doesNotMatch(error.stdout, /Summary /);
        return true;
      }
    );

  });

  it("treats an explicit empty workspaces array the same as a missing one", async () => {
    await assert.rejects(
      execFileAsync("node", [BIN], { cwd: EMPTY_WORKSPACES_FIXTURE }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /Your project does not have any workspaces./);
        assert.doesNotMatch(error.stdout, /Summary/);
        return true;
      }
    );
  });

  it("prints a friendly message instead of a stack trace for a stray positional argument", async () => {
    await assert.rejects(
      execFileAsync("node", [BIN, "foo"], { cwd: PROJECT_WITH_WORKSPACES }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /does not take positional arguments/);
        assert.match(error.stdout, /sumlyzer --help/);
        assert.doesNotMatch(error.stdout, /at ModuleJob|node:internal/);
        return true;
      }
    );
  });

  it("prints a friendly message instead of a stack trace when --script is missing its value", async () => {
    await assert.rejects(
      execFileAsync("node", [BIN, "--script"], { cwd: PROJECT_WITH_WORKSPACES }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /argument missing/);
        assert.match(error.stdout, /sumlyzer --help/);
        assert.doesNotMatch(error.stdout, /at ModuleJob|node:internal/);
        return true;
      }
    );
  });
});

describe("sumlyzer run behavior", () => {
  it("runs every eligible workspace, reports pass/fail per workspace and an overall summary", async () => {
    const { stdout, code } = await runCli([], RUN_FIXTURE);

    assert.equal(code, 1);

    // custom-script-ws has no "test" script: it never runs and is never mentioned.
    assert.doesNotMatch(stdout, /custom-script-ws/);

    assert.match(stdout, /running fail-ws/);
    assert.match(stdout, /✗ fail-ws failed/);
    assert.match(stdout, /✖ some assertion/);
    assert.match(stdout, /✖ another assertion/);

    assert.match(stdout, /✓ pass-ws.*\(3\/3 tests\)/);
    assert.match(stdout, /✓ custom-runner-ws/);

    // no --ff: all three eligible workspaces ran, none skipped.
    assert.doesNotMatch(stdout, /SKIPPED/);
    assert.match(stdout, /1\/3 workspace\(s\) failed:/);
  });

  it("--ff stops at the first failing workspace and marks the rest as skipped", async () => {
    const { stdout, code } = await runCli(["--ff"], RUN_FIXTURE);

    assert.equal(code, 1);
    assert.match(stdout, /running fail-ws/);
    assert.doesNotMatch(stdout, /running pass-ws/);
    assert.doesNotMatch(stdout, /running custom-runner-ws/);
    assert.match(stdout, /2 workspace\(s\) skipped \(--ff\): pass-ws, custom-runner-ws/);
    assert.match(stdout, /1\/1 workspace\(s\) failed:/);

    // regression guard: a workspace that never ran must not also be listed as PASS.
    assert.doesNotMatch(stdout, /pass-ws\W+PASS/);
  });

  it("on GitHub Actions, folds each workspace's full output behind group/endgroup instead of the plain format", async () => {
    const { stdout, code } = await runCli([], RUN_FIXTURE, { GITHUB_ACTIONS: "true" });

    assert.equal(code, 1);

    assert.match(stdout, /::group::✓ pass-ws.*\(3\/3 tests\)/);
    assert.match(stdout, /ℹ tests 3/); 
    assert.match(stdout, /::group::✗ fail-ws.*\(2\/4 tests\)/);
    assert.match(stdout, /✖ some assertion \(12\.3ms\)/);
    assert.match(stdout, /::endgroup::/);

    // the plain-format markers must NOT appear.
    assert.doesNotMatch(stdout, /✗ fail-ws failed/);
  });

  it("--script switches which npm script is run and re-applies eligibility filtering", async () => {
    const { stdout, code } = await runCli(["--script", "verify"], RUN_FIXTURE);

    assert.equal(code, 0);
    assert.match(stdout, /running custom-script-ws/);
    assert.match(stdout, /✓ custom-script-ws/);

    // workspaces without a "verify" script are excluded entirely.
    assert.doesNotMatch(stdout, /fail-ws/);
    assert.doesNotMatch(stdout, /pass-ws/);
    assert.doesNotMatch(stdout, /custom-runner-ws/);
    assert.match(stdout, /1\/1 workspaces passed\./);
  });

  it("--junit warns when a workspace's script never produced a junit file (e.g. --script isn't node:test)", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "sumlyzer-junit-cli-"));
    const outFile = path.join(outDir, "report.xml");

    try {
      const { stdout, code } = await runCli(["--script", "verify", "--junit", outFile], RUN_FIXTURE);

      assert.equal(code, 0);
      assert.match(stdout, /1 workspace\(s\) missing from the JUnit report: custom-script-ws/);

      const report = await readFile(outFile, "utf8");
      assertWellFormedXml(report);
    }
    finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("prints an empty 0/0 summary when no workspace has the target script, instead of crashing", async () => {
    const { stdout, code } = await runCli([], NO_ELIGIBLE_FIXTURE);

    assert.equal(code, 0);
    assert.match(stdout, /0\/0 workspaces passed\./);
    assert.doesNotMatch(stdout, /Your project does not have any workspaces\./);
  });

  it("--junit writes an aggregated JUnit report merging every workspace's testsuites", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "sumlyzer-junit-cli-"));
    const outFile = path.join(outDir, "report.xml");

    try {
      const { code } = await runCli(["--junit", outFile], JUNIT_FIXTURE);

      assert.equal(code, 1);

      const report = await readFile(outFile, "utf8");
      assert.match(report, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
      assert.match(report, /<testsuites>[\s\S]*<\/testsuites>/);
      assert.match(report, /<testsuite name="pass-ws">[\s\S]*<testcase name="adds numbers"/);
      assert.match(report, /<testsuite name="fail-ws">[\s\S]*<testcase name="breaks"/);
      assert.match(report, /<failure/);
      assertWellFormedXml(report);
    }
    finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("--junit keeps nested describe() blocks as nested <testsuite> elements without unbalancing the merged XML", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "sumlyzer-junit-cli-"));
    const outFile = path.join(outDir, "report.xml");

    try {
      await runCli(["--junit", outFile], JUNIT_FIXTURE);

      const report = await readFile(outFile, "utf8");
      assert.match(report, /<testsuite name="nested-ws › outer suite"[^>]*>[\s\S]*<testsuite name="inner suite"[^>]*>/);
      assertWellFormedXml(report);
    }
    finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("--junit writes to <dir>/junit.xml when <path> is an existing directory", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "sumlyzer-junit-cli-"));

    try {
      const { code } = await runCli(["--junit", outDir], JUNIT_FIXTURE);

      assert.equal(code, 1);

      const report = await readFile(path.join(outDir, "junit.xml"), "utf8");
      assert.match(report, /<testsuite name="pass-ws">/);
    }
    finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("prints a friendly message instead of a stack trace when the JUnit report can't be written", async () => {
    const { stderr, code } = await runCli(["--junit", "/no-such-directory/report.xml"], JUNIT_FIXTURE);

    assert.equal(code, 1);
    assert.match(stderr, /Could not write JUnit report to "\/no-such-directory\/report.xml"/);
    assert.doesNotMatch(stderr, /at async|node:internal/);
  });
});

