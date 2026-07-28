import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify, styleText } from "node:util";
import path from "node:path";

import { buildJunitReport } from "./junit.mjs";

const execFileAsync = promisify(execFile);

const green = (str) => styleText("green", str);
const red = (str) => styleText("red", str);
const dim = (str) => styleText("dim", str);
const bold = (str) => styleText("bold", str);

const COUNT_INDEX = 1;
const count = (target, output) => new RegExp(String.raw`ℹ ${target} (\d+)`).exec(output)?.[COUNT_INDEX];

const SPEC_REPORTER_FLAGS = "--test-reporter=spec --test-reporter-destination=stdout";

export function envWithSpecReporter(env, junitDestPath) {
  const existing = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ` : "";
  const junitFlags = junitDestPath ? ` --test-reporter=junit --test-reporter-destination=${junitDestPath}` : "";
  // Drop NODE_TEST_CONTEXT: if sumlyzer itself is invoked from inside a node:test run (e.g.
  // its own test suite), this var would otherwise leak into the workspace's own `node --test`
  // process, which then silently treats itself as a nested child and stops reporting normally.
  const rest = { ...env };
  delete rest.NODE_TEST_CONTEXT;
  return { ...rest, NODE_OPTIONS: `${existing}${SPEC_REPORTER_FLAGS}${junitFlags}` };
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

async function runWorkspaceScript(root, wsPath, scriptName, junitDestPath) {
  const start = Date.now();
  const options = {
    cwd: root,
    shell: process.platform === "win32",
    maxBuffer: 20 * 1024 * 1024,
    env: envWithSpecReporter(process.env, junitDestPath)
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
    failingTests: parseFailingTests(output),
    junitDestPath
  };
}

async function collectJunitEntries(results) {
  const entries = [];
  const missing = [];

  for (const result of results) {
    if (!result.junitDestPath) {
      continue;
    }
    try {
      entries.push({ name: workspaceName(result.wsPath), xml: await readFile(result.junitDestPath, "utf8") });
    }
    catch {
      // Either the workspace crashed before node:test's own junit reporter could write its
      // file, or --script points at something that isn't node:test at all; skip it, but the
      // caller still needs to know so it can tell the user the report is missing an entry.
      missing.push(workspaceName(result.wsPath));
    }
  }

  return { entries, missing };
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

function printWorkspaceResult(name, result) {
  const seconds = formatSeconds(result.durationMs);
  const countsLabel = result.counts ? ` (${result.counts.pass}/${result.counts.tests} tests)` : "";

  if (result.exitCode === 0) {
    process.stdout.write(green(`✓ ${name}`) + dim(` ${seconds}${countsLabel}\n`));
    return;
  }

  process.stdout.write(`\n${bold(red(`✗ ${name} failed`))}\n`);
  process.stdout.write(result.failureDetails + "\n");
  process.stdout.write(red(`✗ ${name}`) + dim(` ${seconds}, exit code ${result.exitCode}\n\n`));
}

async function runWorkspaces({ root, workspacesToRun, scriptName, ff, junitDir }) {
  const results = [];

  for (const [index, wsPath] of workspacesToRun.entries()) {
    const name = workspaceName(wsPath);
    process.stdout.write(dim(`running ${name}\n`));

    const junitDestPath = junitDir ? path.join(junitDir, `${index}.xml`) : undefined;

    let result;
    try {
      result = await runWorkspaceScript(root, wsPath, scriptName, junitDestPath);
    }
    catch (error) {
      console.error(red(`✗ ${name}: could not launch "${scriptName}" (${error.message})`));
      process.exit(1);
    }
    results.push(result);
    printWorkspaceResult(name, result);

    if (result.exitCode !== 0 && ff) {
      break;
    }
  }

  return results;
}

const DEFAULT_JUNIT_FILENAME = "junit.xml";

async function resolveJunitDestination(root, junitPath) {
  const destination = path.resolve(root, junitPath);
  const isExistingDirectory = await stat(destination).then((stats) => stats.isDirectory(), () => false);

  return isExistingDirectory ? path.join(destination, DEFAULT_JUNIT_FILENAME) : destination;
}

async function writeJunitReport(root, junitPath, results) {
  const { entries, missing } = await collectJunitEntries(results);
  const destination = await resolveJunitDestination(root, junitPath);

  if (missing.length > 0) {
    console.log(dim(`${missing.length} workspace(s) missing from the JUnit report: ${missing.join(", ")}`));
  }

  try {
    await writeFile(destination, buildJunitReport(entries));
  }
  catch (error) {
    console.error(red(`Could not write JUnit report to "${destination}" (${error.message})`));
    process.exitCode = 1;
  }
}

function printSummary(results, skipped) {
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
}

function reportOutcome(results) {
  const failed = results.filter((result) => result.exitCode !== 0);

  if (failed.length === 0) {
    console.log(green(`${results.length}/${results.length} workspaces passed.`));
    return;
  }

  console.log(red(`${failed.length}/${results.length} workspace(s) failed:`));
  for (const result of failed) {
    console.log(red(`  ${workspaceName(result.wsPath)}`));
    for (const testName of result.failingTests) {
      console.log(dim(`    ✖ ${testName}`));
    }
  }
  process.exitCode = 1;
}

export async function main({ root, scriptName, ff, junitPath }) {

  const { workspaces } = readJson(path.join(root, "package.json"));

  if (!workspaces || workspaces.length === 0) {
    console.info("Your project does not have any workspaces.");
    process.exit(1);
  }

  const workspacesToRun = listEligibleWorkspaces(root, workspaces, scriptName);
  const junitDir = junitPath ? await mkdtemp(path.join(tmpdir(), "sumlyzer-junit-")) : null;

  let results;
  try {
    results = await runWorkspaces({ root, workspacesToRun, scriptName, ff, junitDir });

    if (junitDir) {
      await writeJunitReport(root, junitPath, results);
    }
  }
  finally {
    if (junitDir) {
      await rm(junitDir, { recursive: true, force: true });
    }
  }

  printSummary(results, workspacesToRun.slice(results.length));
  reportOutcome(results);
}
