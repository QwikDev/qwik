---
name: qwik-optimizer-development
description: Use when modifying or reviewing the Qwik optimizer under packages/optimizer, Rust transform code, WASM/NAPI bindings, optimizer snapshots, or optimizer-facing runtime behavior.
---

# Qwik Optimizer Development

Use this skill for `packages/optimizer/**` and Rust optimizer work. Keep the repo-wide rules from
`.ruler/AGENTS.md` in force.

## Fast Path

1. Identify whether the change is Rust transform logic, snapshots, WASM bindings, NAPI bindings, or
   TypeScript optimizer-facing integration.
2. Read the closest Rust source, fixture, snapshot, and runtime helper that consumes the emitted
   shape before editing.
3. Keep transform behavior deterministic: prefer explicit parser/AST cases and stable ordering over
   source-text heuristics.
4. Use Rust-focused verification first; use `pnpm build.rust` only when a full binding/WASM rebuild
   is required. It is the only build step that needs the Rust toolchain and `wasm-pack`.
5. If a runtime/core change is also involved, load `qwik-core-development` for that slice.

## Source Map

- Rust optimizer core: `packages/optimizer/core/src/`
- Rust fixtures: `packages/optimizer/core/src/fixtures/`
- Rust snapshots: `packages/optimizer/core/src/snapshots/`
- WASM bindings: `packages/optimizer/wasm/`
- NAPI bindings: `packages/optimizer/napi/`
- Optimizer package entry points: `packages/optimizer/src/`
- Vite/Rollup integration: `packages/qwik-vite/src/`

## Verification

Use the smallest command that covers the change:

```bash
pnpm lint.rust
pnpm test.rust
pnpm test.rust.update
pnpm build.rust
pnpm vitest run packages/qwik-vite/src/plugins/plugin.unit.ts
```

`pnpm test.rust` maps to `make test`, which runs Cargo tests for
`packages/optimizer/core/Cargo.toml`. Use `pnpm test.rust.update` only when snapshot updates are
intentional. The repo's own scripts and tests run on the TypeScript optimizer, so exercising the
Rust bindings end to end needs an app that uses the default optimizer (for example the starters via
`pnpm test.e2e.cli`) after `pnpm build.rust`.

## Baselining a TypeScript optimizer failure

The repo's unit and e2e suites run on the TypeScript optimizer, so a parity bug shows up as a
failing core test rather than a snapshot diff. To tell a TS-only bug from a pre-existing failure:

1. `pnpm build.platform.copy` downloads the published Rust bindings (no toolchain needed).
2. Flip `tsOptimizer` to `false` in `vitest.config.ts`, rerun the failing file, flip it back.
3. Transform the failing source with both `createOptimizer`s (`packages/optimizer/dist/index.mjs`
   and `packages/qwik/dist/ts-optimizer.mjs`) using the plugin's options (server: `hoist`,
   `minify: 'simplify'`, plus the client `stripCtxName`/`stripExports` and server
   `stripEventHandlers` lists from `packages/qwik-vite/src/plugins/plugin.ts`) and diff the
   outputs; without the strip options a diff can look identical while the real build differs.
   Call sites (`.w([captures])`, `q:p`, stripped `q_qrl_*` sentinels) diverge more often than
   segment bodies.
   When an e2e app misbehaves, baseline the app build too, not only the router library: the dev
   server compiles the fixture apps with whichever optimizer its `qwikVite()` call selects.
   Compare `segment.entry` per display name as well, in `mode: 'prod'`: a grouping gap shows up
   only as a different bundle count in the app's `q-manifest.json`, never as a failing test.
   The router SSG snapshot e2e runs on both optimizers in CI, so any output difference between
   them fails there; keep it that way instead of skipping one leg.
4. Rebuild the bundle with `pnpm build --optimizer --dev` before rerunning core tests; vitest loads
   `packages/qwik/dist/ts-optimizer.mjs`, not the optimizer source.

## Worker pool changes

The transform worker pool (`packages/ts-optimizer/src/worker-pool.ts`) never starts real workers
under vitest: the worker entry cannot resolve the `.js`-suffixed imports of the TypeScript sources,
so pool tests silently fall back to in-process transforms. Verify worker behaviour against the
built bundle instead: `pnpm build --optimizer`, then a Node script that imports
`packages/qwik/dist/ts-optimizer.mjs`, runs a few transforms, and reads `VmData` from
`/proc/self/status` before spawning a child process. fork() fails with ENOMEM when one mapping
exceeds RAM plus swap, and the raw-transfer buffers of several threads in one process coalesce into
one mapping (three workers made an 18 GB mapping on a 16 GB host), so keep raw-transfer parsing
and other multi-gigabyte reservations out of the workers. `QWIK_TS_OPTIMIZER_RAW_TRANSFER=0` turns
raw transfer off in the host as well when a spawn still fails with ENOMEM.

## Generated Binding Names

Both optimizers invent bindings (`_rawProps`, `_defaultValue`, the `use*` destructure flattening).
Neither gets a scope-correct rename for free, so name uniqueness is the transform's job:

- Rust: `private_ident!` plus swc hygiene is not enough once a binding is captured by an extracted
  segment. Hygiene commits one name per `SyntaxContext` in source order, and segments lifted to
  module scope are sibling scopes that each keep the base name — the enclosing component scope then
  carries a duplicate declaration hygiene never revisits. Number generated names at creation.
- TypeScript: there is no hygiene pass at all, and the rewrite matches identifiers by name. Number
  every generated binding, skip names inside destructuring patterns, and resolve references through
  oxc-walker's `ScopeTracker` so names re-bound in a nested scope keep their declaration. Do not
  bail out of the rewrite on shadowing — Rust still consolidates, and the snapshot diverges.
- Props objects (`_rawProps`) follow Rust hygiene: each takes the lowest `_rawProps{n}` not held by
  a props object bound beside it, in emission order. A segment file is its own module; inline `.s()`
  bodies share one, so never hardcode a suffix — go through `rawPropsBindingNames`.

Pin cross-optimizer behavior with a Rust `test_input!` snapshot registered in
`packages/ts-optimizer/tests/optimizer/snapshot-options.ts`, not with string asserts in a TS test:
only the convergence suite catches parity drift. Its mismatches fail in the final
`convergence summary` test, so a `-t` filter that skips it reports a false pass.

## Hard Rules

- Do not hand-edit generated optimizer build output in `dist/`, `lib/`, or `target/`.
- Do not update snapshots without understanding the transform behavior change.
- Add or update a transform fixture/snapshot for every optimizer behavior change, including negative
  cases where the transform must not run.
- Keep optimizer output and runtime JSX/QRL/loader semantics in sync. If a transform changes an
  emitted attribute, import, segment, or capture shape, inspect the runtime consumer too.
- After touching `packages/optimizer/core/`, do not claim verification without Rust test/build
  evidence or a recorded blocker.
- If this skill becomes stale after source inspection, update it before finishing or record why
  guidance edits were out of scope.
