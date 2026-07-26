import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "sumlyzer.mjs");
const PROJECT_WITH_WORKSPACES = path.join(ROOT, "test", "workspaces-fixture");
const PROJECT_WITHOUT_WORKSPACES = path.join(ROOT, "test", "no-workspaces-fixture");
const RUN_FIXTURE = path.join(ROOT, "test", "run-fixture");
const NO_ELIGIBLE_FIXTURE = path.join(ROOT, "test", "no-eligible-fixture");
const EMPTY_WORKSPACES_FIXTURE = path.join(ROOT, "test", "empty-workspaces-fixture");

async function runCli(args, cwd) {
  try {
    const { stdout } = await execFileAsync("node", [BIN, ...args], { cwd });
    return { stdout, code: 0 };
  }
  catch (error) {
    return { stdout: error.stdout, code: error.code };
  }
}

describe("sumlyzer CLI behaviors", () => {
  it("--help prints usage and exits 0", async () => {
    const { stdout } = await execFileAsync("node", [BIN, "--help"], { cwd: PROJECT_WITH_WORKSPACES });

    assert.match(stdout, /sumlyzer \[options\]/);
    assert.match(stdout, /--script <name>/);
    assert.match(stdout, /--ff/);
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

  it("prints an empty 0/0 summary when no workspace has the target script, instead of crashing", async () => {
    const { stdout, code } = await runCli([], NO_ELIGIBLE_FIXTURE);

    assert.equal(code, 0);
    assert.match(stdout, /0\/0 workspaces passed\./);
    assert.doesNotMatch(stdout, /Your project does not have any workspaces\./);
  });
});

