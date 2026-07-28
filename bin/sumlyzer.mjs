#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";

import { main } from "../src/run.mjs";

let values;
try {
  ({ values } = parseArgs({
    options: {
      ff: { type: "boolean", default: false },
      script: { type: "string", default: "test" },
      junit: { type: "string" },
      help: { type: "boolean", short: "h", default: false }
    }
  }));
}
catch (error) {
  if (error.code?.startsWith("ERR_PARSE_ARGS")) {
    console.info(`${error.message}. Run "sumlyzer --help" for usage.`);
  }
  process.exit(1);
}

if (values.help) {
  console.log(`sumlyzer [options]

Runs each npm workspace's "${values.script}" script one by one. Passing
workspaces collapse to a single line; failing ones print only the relevant
failure detail. Ends with an aggregated pass/fail summary table.

Options:
  --script <name>  npm script to run per workspace (default: "test")
  --ff             fail fast: stop at the first failing workspace
  --junit <path>   write an aggregated JUnit XML report to <path>
  -h, --help       show this help
`);
  process.exit(0);
}

await main({ root: path.resolve(process.cwd()), scriptName: values.script, ff: values.ff, junitPath: values.junit });
