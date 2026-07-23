import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin", "sumlyzer.mjs");

describe("sumlyzer CLI", () => {
  it("--help prints usage and exits 0", async () => {
    const { stdout } = await execFileAsync("node", [BIN, "--help"], { cwd: ROOT });

    assert.match(stdout, /sumlyzer \[options\]/);
    assert.match(stdout, /--script <name>/);
    assert.match(stdout, /--ff/);
    assert.match(stdout, /-h, --help/);
  });

  it("-h is the same as --help", async () => {
    const [full, short] = await Promise.all([
      execFileAsync("node", [BIN, "--help"], { cwd: ROOT }),
      execFileAsync("node", [BIN, "-h"], { cwd: ROOT })
    ]);

    assert.equal(short.stdout, full.stdout);
  });

  it("reflects --script in the help text instead of the \"test\" default", async () => {
    const { stdout } = await execFileAsync("node", [BIN, "--help", "--script", "check"], { cwd: ROOT });

    assert.match(stdout, /"check" script/);
  });

  it("prints a friendly message for an unknown flag instead of a stack trace", async () => {
    await assert.rejects(
      execFileAsync("node", [BIN, "--unknown-flag"], { cwd: ROOT }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Unknown option '--unknown-flag'/);
        assert.match(error.stderr, /sumlyzer --help/);
        assert.doesNotMatch(error.stderr, /at ModuleJob|node:internal/);
        return true;
      }
    );
  });
});
