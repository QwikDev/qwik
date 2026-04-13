# Test Suite

## Overview

The optimizer has two types of tests:

1. **Unit tests** (`tests/optimizer/*.test.ts`) — test individual functions and behaviors
2. **Convergence tests** (`tests/optimizer/convergence.test.ts`) — compare our TS output against the SWC (Rust) optimizer's golden snapshots

## Snapshot Directories

### `match-these-snaps/` — The Source of Truth

209 snapshot files produced by the **Rust SWC optimizer**. These are in Rust's [insta](https://insta.rs/) snapshot format with YAML frontmatter.

Each snapshot contains:
- `==INPUT==` — the original Qwik source code
- Parent module output — the rewritten source with `$()` calls replaced by QRL references
- Segment modules — the extracted lazy-loadable closures with metadata (name, hash, origin, captures)
- `==DIAGNOSTICS==` — any warnings/errors (C02, C05, etc.)

**These are the target.** They come from Qwik's Rust test suite and define what we want our TS optimizer to eventually match.

### `ts-output/` — What We Currently Produce

**Automatically regenerated** every time the convergence tests run. Each snapshot with an `==INPUT==` section gets transformed and written here (208 of 209 — `relative_paths` has no input section).

## How Convergence Tests Work

```
match-these-snaps/*.snap  →  parseSnapshot()  →  extract INPUT
                                                       ↓
                                                  transformModule()
                                                       ↓
                                              compareAst(expected, actual)
```

1. Read a golden snapshot from `match-these-snaps/`
2. Parse it to extract the INPUT code and expected outputs
3. Look up per-snapshot options in `tests/optimizer/snapshot-options.ts`
4. Run `transformModule()` with those options
5. Compare actual vs expected using **AST comparison** (ignores formatting, compares structure)
6. Compare segment metadata (hash, origin, ctxName, captures) as exact matches

### Per-Snapshot Options

Most snapshots use defaults, but ~40 have custom options defined in `snapshot-options.ts`:

```typescript
// Default options
{
  transpileTs: false,
  transpileJsx: false,
  mode: 'lib',
  entryStrategy: { type: 'segment' },
  minify: 'simplify',
  filename: 'test.tsx',
  srcDir: '/user/qwik/src/',
}
```

Overrides handle cases like dev mode, inline entry strategy, TypeScript transpilation, custom filenames, etc.

## Running Tests

```bash
# Run convergence tests (main command — also regenerates ts-output/)
pnpm vitest convergence

# Run all tests
pnpm vitest run

# Run a specific snapshot test
pnpm vitest run -t "example_1"

# Run benchmarks (requires local Qwik repo at ~/dev/open-source/qwik)
BENCH=1 pnpm vitest run tests/benchmark/optimizer-benchmark.test.ts --no-file-parallelism
```

## Current State

The convergence tests are a **measurement tool**, not a gate. Not all 209 tests pass yet. The test names track which snapshots match and which diverge, making it easy to see progress over time.

Check the test output for the current pass rate — it's printed as a summary at the end of the convergence test run.
