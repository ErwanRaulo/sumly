import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify, styleText } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const green = (str) => styleText("green", str);
const red = (str) => styleText("red", str);
const dim = (str) => styleText("dim", str);
const bold = (str) => styleText("bold", str);

const COUNT_INDEX = 1;
const count = (target, output) => new RegExp(String.raw`ℹ ${target} (\d+)`).exec(output)?.[COUNT_INDEX];

const SPEC_REPORTER_FLAGS = "--test-reporter=spec --test-reporter-destination=stdout";

export function envWithSpecReporter(env) {
  const existing = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ` : "";
  return { ...env, NODE_OPTIONS: `${existing}${SPEC_REPORTER_FLAGS}` };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function workspaceName(wsPath) {
  return (wsPath ?? "").replace(/^workspaces[\\/]/, "");
}

function listEligibleWorkspaces(root, workspaces, scriptName) {
  return workspaces.filter((wsPath) => {
    const pkgFile = path.join(root, wsPath, "package.json");
    try {
      return Boolean(readJson(pkgFile).scripts?.[scriptName]);
    }
    catch {
      return false;
    }
  });
}

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

export function formatSeconds(ms) {
  const seconds = Number.isFinite(ms) ? ms / 1000 : 0;
  return `${seconds.toFixed(1)}s`;
}

async function runWorkspaceScript(root, wsPath, scriptName) {
  const start = Date.now();
  const options = {
    cwd: root,
    shell: process.platform === "win32",
    maxBuffer: 20 * 1024 * 1024,
    env: envWithSpecReporter(process.env)
  };

  let exitCode = 0;
  let output;
  try {
    const { stdout, stderr } = await execFileAsync("npm", ["run", scriptName, "--workspace=" + wsPath], options);
    output = stripNpmNoise(stdout + stderr);
  }
  catch (error) {
    if (typeof error.code !== "number") {
      throw error;
    }
    exitCode = error.code;
    output = stripNpmNoise((error.stdout ?? "") + (error.stderr ?? ""));
  }

  return {
    wsPath,
    exitCode,
    failureDetails: exitCode === 0 ? null : extractFailureDetails(output),
    durationMs: Date.now() - start,
    counts: parseTestCounts(output),
    failingTests: parseFailingTests(output)
  };
}

function summaryRow(workspace, status, duration, counts) {
  return {
    workspace,
    status,
    duration,
    testsDuration: counts?.durationMs ? formatSeconds(Number(counts.durationMs)) : "-",
    tests: counts?.tests ?? "-",
    pass: counts?.pass ?? "-",
    fail: counts?.fail ?? "-"
  };
}

export async function main({ root, scriptName, ff }) {

  const { workspaces } = readJson(path.join(root, "package.json"));

  if (!workspaces || workspaces.length === 0) {
    console.info("Your project does not have any workspaces.");
    process.exit(1);
  }

  const workspacesToRun = listEligibleWorkspaces(root, workspaces, scriptName);
  const results = [];

  for (const wsPath of workspacesToRun) {
    const name = workspaceName(wsPath);
    process.stdout.write(dim(`running ${name}\n`));

    let result;
    try {
      result = await runWorkspaceScript(root, wsPath, scriptName);
    }
    catch (error) {
      console.error(red(`✗ ${name}: could not launch "${scriptName}" (${error.message})`));
      process.exit(1);
    }
    results.push(result);

    const seconds = formatSeconds(result.durationMs);
    const countsLabel = result.counts ? ` (${result.counts.pass}/${result.counts.tests} tests)` : "";

    if (result.exitCode === 0) {
      process.stdout.write(green(`✓ ${name}`) + dim(` ${seconds}${countsLabel}\n`));
    }
    else {
      process.stdout.write(`\n${bold(red(`✗ ${name} failed`))}\n`);
      process.stdout.write(result.failureDetails + "\n");
      process.stdout.write(red(`✗ ${name}`) + dim(` ${seconds}, exit code ${result.exitCode}\n\n`));

      if (ff) {
        break;
      }
    }
  }

  const failed = results.filter((result) => result.exitCode !== 0);
  const skipped = workspacesToRun.slice(results.length);

  console.log(bold("\nSummary"));
  console.table([
    ...results.map((result) => summaryRow(
      workspaceName(result.wsPath),
      result.exitCode === 0 ? "PASS" : "FAIL",
      formatSeconds(result.durationMs),
      result.counts
    )),
    ...skipped.map((wsPath) => summaryRow(workspaceName(wsPath), "SKIPPED", "-", null))
  ]);

  if (skipped.length > 0) {
    console.log(dim(`${skipped.length} workspace(s) skipped (--ff): ${skipped.map(workspaceName).join(", ")}`));
  }

  if (failed.length > 0) {
    console.log(red(`${failed.length}/${results.length} workspace(s) failed:`));
    for (const result of failed) {
      console.log(red(`  ${workspaceName(result.wsPath)}`));
      for (const testName of result.failingTests) {
        console.log(dim(`    ✖ ${testName}`));
      }
    }
    process.exitCode = 1;
  }
  else {
    console.log(green(`${results.length}/${results.length} workspaces passed.`));
  }
}
