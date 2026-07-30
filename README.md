<p align="center">
  <img src="https://github.com/ErwanRaulo/sumlyzer/blob/main/logo.png?raw=true" alt="Sumlyzer logo" width="140" />
</p>

<h1 align="center">Sumlyzer</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/sumlyzer"><img src="https://img.shields.io/npm/v/sumlyzer.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/sumlyzer"><img src="https://img.shields.io/npm/dm/sumlyzer.svg" alt="npm downloads" /></a>
  <a href="https://www.npmjs.com/package/sumlyzer"><img src="https://img.shields.io/node/v/sumlyzer.svg" alt="node engine" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/sumlyzer.svg" alt="license" /></a>
</p>

Run every npm workspace's test script, one by one. Passing workspaces output
to a single line; failing ones print only the relevant failure detail.
Ends with an aggregated pass/fail summary table, so nothing scrolls out of the terminal.

## Requirements

- Node.js >= 22.0.0
- An npm workspaces project (`package.json` with a `workspaces` field)

## Scope

This tool is intentionally narrow: **npm workspaces** running **`node:test`**.
It orchestrates `npm run <script> --workspace=<path>` for every workspace that
declares the target script, and it parses node test's own reporter output to build
the summary. It does not support pnpm/yarn workspaces or other test runners
(Jest, Vitest, Mocha etc.).

## Install

```
npm install --save-dev sumlyzer
```

## Usage

```
npx sumlyzer [options]
```

Run from the root of an npm workspaces project (where `package.json` has a
`workspaces` field).

Options:

| Flag | Default | Description |
| --- | --- | --- |
| `--script <name>` | `test` | npm script to run per workspace |
| `--ff` | off | fail fast: stop at the first failing workspace |
| `--junit <path>` | off | write an aggregated JUnit XML report to `<path>` |
| `-h, --help` | | print usage |

Exit code is `1` if any workspace fails (or if the project has no
workspaces), `0` otherwise, wire it straight into CI without extra parsing.
This also applies when `--junit` can't write its report (e.g. an invalid
`<path>`): the exit code is `1` even if every workspace's tests passed.

## Example

```
running contact
✓ contact 2.6s (35/35 tests)
running scanner
✓ scanner 10.1s (161/162 tests)
running tarball
✓ tarball 1.8s (77/77 tests)
running mama
✓ mama 1.2s (85/85 tests)
running tree-walker
✓ tree-walker 3.0s (26/26 tests)
running conformance
✓ conformance 1.1s (35/35 tests)
running i18n
✓ i18n 1.1s (19/19 tests)
running rc
✓ rc 4.1s (28/28 tests)
running utils
✓ utils 1.1s (30/30 tests)
running flags
✓ flags 1.1s (9/9 tests)
running fs-walk
✓ fs-walk 1.1s (3/3 tests)
running github
✓ github 2.9s (8/8 tests)
running gitlab
✓ gitlab 4.3s (8/8 tests)

Summary
┌─────────┬────────────────┬──────────┬────────────┬────────────────┬─────────┬────────┬────────┐
│ (index) │ workspace      │ status   │ duration   │ testsDuration  │ tests   │ pass   │ fail   │
├─────────┼────────────────┼──────────┼────────────┼────────────────┼─────────┼────────┼────────┤
│ 0       │ 'contact'      │ 'PASS'   │ '2.6s'     │ '0.9s'         │ '35'    │ '35'   │ '0'    │
│ 1       │ 'scanner'      │ 'PASS'   │ '10.1s'    │ '8.7s'         │ '162'   │ '161'  │ '0'    │
│ 2       │ 'tarball'      │ 'PASS'   │ '1.8s'     │ '0.7s'         │ '77'    │ '77'   │ '0'    │
│ 3       │ 'mama'         │ 'PASS'   │ '1.2s'     │ '0.1s'         │ '85'    │ '85'   │ '0'    │
│ 4       │ 'tree-walker'  │ 'PASS'   │ '3.0s'     │ '2.0s'         │ '26'    │ '26'   │ '0'    │
│ 5       │ 'conformance'  │ 'PASS'   │ '1.1s'     │ '0.1s'         │ '35'    │ '35'   │ '0'    │
│ 6       │ 'i18n'         │ 'PASS'   │ '1.1s'     │ '0.2s'         │ '19'    │ '19'   │ '0'    │
│ 7       │ 'rc'           │ 'PASS'   │ '4.1s'     │ '0.6s'         │ '28'    │ '28'   │ '0'    │
│ 8       │ 'utils'        │ 'PASS'   │ '1.1s'     │ '0.1s'         │ '30'    │ '30'   │ '0'    │
│ 9       │ 'flags'        │ 'PASS'   │ '1.1s'     │ '0.1s'         │ '9'     │ '9'    │ '0'    │
│ 10      │ 'fs-walk'      │ 'PASS'   │ '1.1s'     │ '0.1s'         │ '3'     │ '3'    │ '0'    │
│ 11      │ 'github'       │ 'PASS'   │ '2.9s'     │ '2.0s'         │ '8'     │ '8'    │ '0'    │
│ 12      │ 'gitlab'       │ 'PASS'   │ '4.3s'     │ '3.3s'         │ '8'     │ '8'    │ '0'    │
└─────────┴────────────────┴──────────┴────────────┴────────────────┴─────────┴────────┴────────┘

13/13 workspaces passed.
```

### On failure

Only the failing workspace prints its detail and passing ones stay collapsed to a single line.

```
running contact
✓ contact 2.6s (35/35 tests)
running scanner
✓ scanner 10.1s (161/162 tests)
running utils

✗ utils failed
test at test/format.spec.mjs:12:3
✖ formats negative numbers (3ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal
  + actual - expected

  + '-1'
  - '(1)'

✗ utils 1.3s, exit code 1

running flags
✓ flags 1.1s (9/9 tests)

Summary
┌─────────┬────────────┬──────────┬────────────┬────────────────┬─────────┬────────┬────────┐
│ (index) │ workspace  │ status   │ duration   │ testsDuration  │ tests   │ pass   │ fail   │
├─────────┼────────────┼──────────┼────────────┼────────────────┼─────────┼────────┼────────┤
│ 0       │ 'contact'  │ 'PASS'   │ '2.6s'     │ '0.9s'         │ '35'    │ '35'   │ '0'    │
│ 1       │ 'scanner'  │ 'PASS'   │ '10.1s'    │ '8.7s'         │ '162'   │ '161'  │ '0'    │
│ 2       │ 'utils'    │ 'FAIL'   │ '1.3s'     │ '0.1s'         │ '30'    │ '29'   │ '1'    │
│ 3       │ 'flags'    │ 'PASS'   │ '1.1s'     │ '0.1s'         │ '9'     │ '9'    │ '0'    │
└─────────┴────────────┴──────────┴────────────┴────────────────┴─────────┴────────┴────────┘

1/4 workspace(s) failed:
  utils
    ✖ formats negative numbers
```

### JUnit report

`--junit <path>` writes a single aggregated JUnit XML report to `<path>`, merging
every workspace's own `node:test` results. Each workspace runs with `node:test`'s
built-in `junit` reporter enabled alongside the terminal one, and sumlyzer combines
the resulting files into one document, prefixing every `<testsuite>` name with the
workspace it came from so CI test-report UIs (GitLab, Jenkins, Azure DevOps, ...)
can tell them apart. If `<path>` is an existing directory, the report is written
to `<path>/junit.xml`:

```
npx sumlyzer --junit reports/junit.xml
npx sumlyzer --junit reports/           # writes reports/junit.xml
```

```xml
<testsuites>
  <testsuite name="contact › contact tests">...</testsuite>
  <testsuite name="scanner">...</testsuite>
</testsuites>
```

A workspace whose script never produces a junit file (for example,
`--script` points at something that isn't `node:test`, or the workspace crashed
before it could write one) is left out of the aggregated report and sumlyzer
prints a warning naming it.

### GitHub Actions log folding

On GitHub Actions (detected via `GITHUB_ACTIONS=true`), each workspace's full
`node:test` output is wrapped in a collapsible `::group::`/`::endgroup::`
section instead of the terminal's collapsed-line-or-failure-detail format.
This is automatic, no flag needed, and keeps the job log short by default
while still letting you expand any workspace, passing or failing, to see its
full suite output. 

No other CI provider is currently supported: GitHub is the
only one whose log folding sumlyzer has actually verified end-to-end.

## Why

`npm run test --workspaces --if-present` runs every workspace but gives you
no aggregated summary and no way to fail fast early. An early failure just
scrolls off screen once later workspaces print their own output. sumlyzer is
a small, dependency-free tool that solves just this.

This exact fail-fast behavior at the `--workspaces` level has been requested
from npm more than once:
[npm/rfcs#575](https://github.com/npm/rfcs/issues/575) (open) and
[npm/rfcs#602](https://github.com/npm/rfcs/issues/602) (closed). Until it
lands (if it ever does), sumlyzer's `--ff` flag gets you there.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, conventions, and how to submit changes.

## License

MIT
