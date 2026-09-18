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
4. Use Rust-focused verification first; use `pnpm build.full` only when a full optimizer/WASM rebuild
   is required.
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
pnpm test.rust
pnpm test.rust.update
pnpm build.full
pnpm vitest run packages/qwik-vite/src/plugins/plugin.unit.ts
```

`pnpm test.rust` maps to `make test`, which runs Cargo tests for
`packages/optimizer/core/Cargo.toml`. Use `pnpm test.rust.update` only when snapshot updates are
intentional.

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
