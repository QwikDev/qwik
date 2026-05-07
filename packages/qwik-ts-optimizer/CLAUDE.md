# TS Optimizer

Is a rewrite of the Rust SWC based optimizer (code found in `./swc-reference-only`) in TypeScript using the OXC parser.

## Current goals

### 100% Snapshot Test Parity via Convergence Testing

`pnpm vitest convergence` tests parity using the snapshots found in `./match-these-snaps`.

When the test case runs, it produces a new snapshot file for each test in `ts-output`.  The names line up to make comparison easy.

Formating, whitespace, import are not relevant to the test.  Only that the ASTs are semnatically equivalent matters.

The goal is to get all of these tests passing.
