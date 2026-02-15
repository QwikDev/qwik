# Qwik v2 — AI Agent Instructions

> Canonical instruction file for AI coding agents working on the Qwik v2 monorepo.
> For detailed contributor setup, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Overview

Qwik is a **resumable** web framework — it serializes application state and framework state into HTML during SSR, then resumes on the client without re-executing component code. This enables it to stream javascript (a.k.a javascript streaming). There’s no waiting for the entire code to be downloaded (a.k.a hydration). The developer can write code very similar to other reactive frameworks; the app is automatically instant, regardless the amount of javascript.

**Qwik v2** is a major rewrite featuring a new VNode-based runtime, rewritten reactive primitives, a new serialization mechanism, and new package names under `@qwik.dev/*`.

**Key concepts:** Resumability, QRLs (lazy-loading primitives), the `$` suffix transform, fine-grained signals, VNodes, the cursor system, and the Rust-based optimizer.

## Monorepo Layout

| Package              | Path                          | Description                                    |
| -------------------- | ----------------------------- | ---------------------------------------------- |
| `@qwik.dev/core`     | `packages/qwik`               | Core framework (runtime + optimizer)           |
| `@qwik.dev/router`   | `packages/qwik-router`        | Meta-framework (routing, middleware, adapters) |
| `@qwik.dev/react`    | `packages/qwik-react`         | React integration layer                        |
| `@qwik.dev/dom`      | `packages/qwik-dom`           | Server-side DOM implementation                 |
| `eslint-plugin-qwik` | `packages/eslint-plugin-qwik` | ESLint rules for Qwik                          |
| `create-qwik`        | `packages/create-qwik`        | Project scaffolding CLI                        |
| `qwik-docs`          | `packages/docs`               | Documentation site (private)                   |
| `insights`           | `packages/insights`           | Analytics dashboard (private)                  |

> **Note:** v2 packages use `@qwik.dev/*` scope (v1 used `@builder.io/*`). The pnpm-workspace.yaml has compatibility overrides for the old names.

## Setup

**Requirements:** Node ≥22.18.0, pnpm ≥10.14.0

```bash
pnpm i
```

Use `pnpm build.full` only if you modified Rust/optimizer code.

Prefer `pnpm build --qwik --qwikrouter --dev` to build qwik and qwik-city faster.

## Key Commands

| Task                     | Command                                | Notes                                                                                                                                                     |
| ------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Install**              | `pnpm install`                         |                                                                                                                                                           |
| **Build (no Rust)**      | `pnpm build.local`                     | For a fresh start                                                                                                                                         |
| **Build (with Rust)**    | `pnpm build.full`                      | Only for optimizer changes                                                                                                                                |
| **Build core only**      | `pnpm build.core`                      | Fast — just Qwik + Router + types                                                                                                                         |
| **Dev rebuild**          | `pnpm build --dev --qwik --qwikrouter` | Very fast iterative rebuild                                                                                                                               |
| **Watch mode**           | `pnpm build.watch`                     | Rebuilds on change                                                                                                                                        |
| **Unit tests**           | `pnpm vitest run`                      | Vitest — runs `packages/**/*.unit.{ts,tsx}` and `*.spec.{ts,tsx}`, or specify a single file. Add `-u` to update snapshots. **NEVER use `pnpm test.unit`** |
| **E2E tests (Chromium)** | `pnpm test.e2e.chromium`               | Playwright - always run the dev rebuild first!                                                                                                            |
| **E2E tests (Router)**   | `pnpm test.e2e.router`                 | Router-specific E2E - always run the dev rebuild first!                                                                                                   |
| **Lint**                 | `pnpm lint`                            | ESLint + Prettier + Rust lint                                                                                                                             |
| **Lint fix**             | `pnpm lint.fix`                        | Auto-fix ESLint issues                                                                                                                                    |
| **Format**               | `pnpm fmt`                             | Prettier + syncpack                                                                                                                                       |
| **Type check**           | `pnpm tsc.check`                       | Full TypeScript check                                                                                                                                     |
| **Update API docs**      | `pnpm api.update`                      | Regenerates public API `.md` files                                                                                                                        |
| **Create changeset**     | `pnpm change`                          | Interactive — creates `.changeset/*.md`                                                                                                                   |
| **Dev server**           | `pnpm serve`                           | Port 3300                                                                                                                                                 |
| **Docs dev**             | `pnpm docs.dev`                        | Documentation site                                                                                                                                        |

### Running a Single Test File

```bash
# Unit/spec test — single file
pnpm vitest run packages/qwik/src/core/tests/use-task.spec.tsx

# E2E test — single file
pnpm playwright test starters/e2e/e2e.events.e2e.ts --project chromium
```

## Architecture Essentials

### Resumability

Qwik serializes the full application state into HTML at SSR time. On the client, it **resumes** from that serialized state instead of re-executing components (no hydration). In v2, serialization is moved to the end of HTML for faster content delivery, and deep objects are only flattened when circular references are detected.

### VNode System (v2)

v2 replaces v1's comment-node approach with a **VNode** tree. VNodes are lazy-materialized from the DOM plus `<script type="qwik/vnode">` data. VNodes are represented as arrays for memory efficiency. `VirtualVNode` represents components with serializable properties.

- Client-side rendering & diffing: `packages/qwik/src/core/client/`
- VNode implementation: `packages/qwik/src/core/shared/vnode/`

### Cursor System (v2)

A new DOM manipulation architecture that handles efficient updates.

- Implementation: `packages/qwik/src/core/shared/cursor/`

### QRL & the `$` Transform

A **QRL** (Qwik Resource Locator) is a lazy reference to a closure. Any function ending with `$` (e.g., `component$`, `useTask$`, `$()`) creates a QRL boundary — the optimizer extracts these into separate chunks for lazy loading.

- QRL implementation: `packages/qwik/src/core/shared/qrl/`
- The Rust optimizer rewrites `$`-suffixed calls at build time

### Reactive Primitives (v2)

Rewritten fine-grained reactivity system. Signals track subscriptions and update only the DOM nodes or tasks that read them — no virtual DOM diffing.

- Implementation: `packages/qwik/src/core/reactive-primitives/`

### Optimizer (Rust)

The optimizer is a Rust-based compiler plugin (SWC transform) that:

1. Extracts `$`-suffixed closures into separate entry points
2. Captures lexical scope for serialization
3. Generates manifest metadata for prefetching

- Rust source: `packages/qwik/src/optimizer/core/`
- WASM build: `packages/qwik/src/wasm/`
- Native bindings: `packages/qwik/src/napi/`

### Qwik Router (Meta-framework)

Qwik Router (formerly Qwik City in v1) provides file-based routing, data loaders (`routeLoader$`), actions (`routeAction$`), middleware, and server adapters.

- Runtime: `packages/qwik-router/src/runtime/`
- Build tooling: `packages/qwik-router/src/buildtime/`
- Adapters: `packages/qwik-router/src/adapters/`

### Core Source Layout

```
packages/qwik/src/core/
├── client/              # Client-side rendering, vnode-diff
├── reactive-primitives/ # Signal implementation (v2 rewrite)
├── shared/              # Shared code (cursor, serdes, jsx, vnode, qrl)
├── ssr/                 # Server-side rendering
├── tests/               # Feature tests for v2
├── use/                 # Hooks (useSignal, useStore, useTask, etc.)
└── preloader/           # Preloader utilities
```

## Code Style

**Config:** Prettier (`.prettierrc.json`) + ESLint 9 flat config (`eslint.config.mjs`)

| Rule           | Setting                    |
| -------------- | -------------------------- |
| Semi           | `true`                     |
| Quotes         | Single                     |
| Print width    | 100                        |
| Tabs           | Spaces (2)                 |
| Trailing comma | ES5                        |
| `no-console`   | Error (warn/error allowed) |
| `curly`        | Always required            |

### Naming Conventions

| Pattern        | Usage                                             | Example                             |
| -------------- | ------------------------------------------------- | ----------------------------------- |
| `use*`         | Hooks (must be called in component or task scope) | `useSignal`, `useStore`, `useTask$` |
| `*$`           | QRL boundary — optimizer extracts the closure     | `component$`, `routeLoader$`        |
| `create*`      | Factory functions                                 | `createContextId`                   |
| `*.unit.ts(x)` | Unit test files (Vitest)                          | `qrl.unit.ts`                       |
| `*.spec.ts(x)` | Spec test files (Vitest)                          | `use-task.spec.tsx`                 |
| `*.e2e.ts`     | E2E test files (Playwright)                       | `e2e.events.e2e.ts`                 |

## Testing

### Unit & Spec Tests (Vitest)

- File patterns: `*.unit.ts` / `*.unit.tsx` / `*.spec.ts` / `*.spec.tsx`
- Config: `vitest.config.ts` (root) — uses `qwikVite` plugin
- Run all: `pnpm test.unit`
- Run one: `pnpm vitest run <path>`
- Setup: `vitest-setup.ts` configures qTest globals and test platform

### E2E Tests (Playwright)

- File pattern: `*.e2e.ts` in `starters/e2e/`
- Config: `starters/playwright.config.ts`
- Run: `pnpm test.e2e.chromium`
- Run one: `pnpm playwright test <path> --project chromium`
- Browsers: Chromium and WebKit enabled (Firefox disabled)
- Additional E2E suites: `e2e/adapters-e2e/`, `e2e/qwik-react-e2e/`

### Rust Tests

- Run: `pnpm test.rust` (or `make test`)
- Update snapshots: `pnpm test.rust.update` (or `make test-update`)
- Benchmark: `pnpm test.rust.bench`

## Git Workflow

### Commit Convention

```
type(scope): description
```

Types: `feat`, `fix`, `docs`, `lint`, `refactor`, `perf`, `test`, `chore`

- Use imperative mood ("add feature" not "added feature")
- No trailing period
- Scope is optional but encouraged (e.g., `fix(router): ...`)

### Changesets

If your change affects published packages, create a changeset:

```bash
pnpm change
```

This creates a `.changeset/*.md` file describing the change. The core packages (`@qwik.dev/core`, `@qwik.dev/router`, `eslint-plugin-qwik`, `create-qwik`, `@qwik.dev/react`) are **fixed-versioned** — they always release together.

### Branch Strategy

- **Base branch for PRs:** `main`
- **Release base branch:** `build/v2` (used by changesets)
- Trunk-based development

### Before Pushing a PR

1. `pnpm build.core`
2. `pnpm test.unit` (run relevant tests)
3. `pnpm lint`
4. `pnpm api.update` (if you changed public API)
5. `pnpm change` (to document patches or new features)

## Boundaries — What NOT to Do

1. **Don't run the full test suite** — Use `pnpm test.unit` or target specific files. The full `pnpm test` runs build + all tests and takes a very long time.
2. **Don't forget `pnpm api.update`** — If you change any public API, CI will fail without regenerated API docs.
3. **Don't modify Rust code without rebuilding** — After touching `packages/qwik/src/optimizer/core/`, run `pnpm build.full` (requires Rust toolchain + wasm-pack).
4. **Don't skip changesets for user-facing changes** — CI checks for changesets on PRs that touch published packages.
5. **Don't commit `.only` tests** — ESLint rule `no-only-tests` blocks this.
6. **Don't edit generated files** — Files in `dist/`, `lib/`, and API docs are generated. Edit the source instead.
7. **Don't use v1 package names** — Use `@qwik.dev/core` and `@qwik.dev/router`, not `@builder.io/qwik` and `@builder.io/qwik-city`.
