# Sumlyzer

Run every npm workspace's test script, one by one. Passing workspaces output
to a single line; failing ones print only the relevant failure detail.
Ends with an aggregated pass/fail summary table, so nothing scrolls out of the terminal.

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
| `-h, --help` | | print usage |

## Example

![description](https://github.com/ErwanRaulo/sumlyzer/blob/main/example.png?raw=true)


## Why

`npm run test --workspaces --if-present` runs every workspace but gives you
no aggregated summary and no way to fail fast early. An early failure just
scrolls off screen once later workspaces print their own output. Turborepo
has the [same open issue](https://github.com/vercel/turborepo/issues/1368).
sumlyzer is a small, dependency-free tool that solves just this.

## License

MIT
