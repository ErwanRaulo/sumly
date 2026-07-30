import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import path from "node:path";

import { buildJunitReport } from "./junit.mjs";
import { parseTestCounts, parseFailingTests, stripNpmNoise, extractFailureDetails } from "./parseOutput.mjs";
import { red, dim, workspaceName, githubGroupSyntax, printWorkspaceResult, printSummary, reportOutcome } from "./reporter.mjs";

const execFileAsync = promisify(execFile);

const SPEC_REPORTER_FLAGS = "--test-reporter=spec --test-reporter-destination=stdout";

export function envWithSpecReporter(env, junitDestPath) {
  const existing = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ` : "";
  const junitFlags = junitDestPath ? ` --test-reporter=junit --test-reporter-destination=${junitDestPath}` : "";
  // Drop NODE_TEST_CONTEXT: if sumlyzer itself is invoked from inside a node:test run, this var would otherwise leak.
  const rest = { ...env };
  delete rest.NODE_TEST_CONTEXT;
  return { ...rest, NODE_OPTIONS: `${existing}${SPEC_REPORTER_FLAGS}${junitFlags}` };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
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
    junitDestPath,
    rawOutput: output
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
      missing.push(workspaceName(result.wsPath));
    }
  }

  return { entries, missing };
}

async function runWorkspaces({ root, workspacesToRun, scriptName, ff, junitDir }) {
  const results = [];
  const ciGroup = githubGroupSyntax(process.env);

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
    printWorkspaceResult(name, result, ciGroup);

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
