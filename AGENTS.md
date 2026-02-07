# Qwik — AI Agent Instructions

> Canonical instruction file for AI coding agents working on the Qwik monorepo.
> For detailed contributor setup, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Overview

Qwik is a **resumable** web framework — it serializes application state and framework state into HTML during SSR, then resumes on the client without re-executing component code. This enables it to stream javascript (a.k.a javascript streaming). There’s no waiting for the entire code to be downloaded (a.k.a hydration). The developer can write code very similar to other reactive frameworks; the app is automatically instant, regardless the amount of javascript.

**Key concepts:** Resumability, QRLs (lazy-loading primitives), the `$` suffix transform, fine-grained signals, and the Rust-based optimizer.

## Monorepo Layout

| Package                   | Path                          | Description                                    |
| ------------------------- | ----------------------------- | ---------------------------------------------- |
| `@builder.io/qwik`        | `packages/qwik`               | Core framework (runtime + optimizer)           |
| `@builder.io/qwik-city`   | `packages/qwik-city`          | Meta-framework (routing, middleware, adapters) |
| `@builder.io/qwik-react`  | `packages/qwik-react`         | React integration layer                        |
| `@builder.io/qwik-auth`   | `packages/qwik-auth`          | Auth.js integration                            |
| `@builder.io/qwik-dom`    | `packages/qwik-dom`           | Server-side DOM implementation                 |
| `@builder.io/qwik-worker` | `packages/qwik-worker`        | Web Worker support (experimental)              |
| `@builder.io/qwik-labs`   | `packages/qwik-labs`          | Experimental features (private)                |
| `eslint-plugin-qwik`      | `packages/eslint-plugin-qwik` | ESLint rules for Qwik                          |
| `create-qwik`             | `packages/create-qwik`        | Project scaffolding CLI                        |
| `qwik-docs`               | `packages/docs`               | Documentation site (private)                   |
| `insights`                | `packages/insights`           | Analytics dashboard (private)                  |

## Setup

**Requirements:** Node ≥22.18.0, pnpm ≥10.14.0

```bash
pnpm install
pnpm build.local    # builds everything without Rust (copies optimizer from npm)
```

Use `pnpm build.full` only if you modified Rust/optimizer code.

Prefer `pnpm build --qwik --qwikcity --dev` to build qwik and qwik-city faster.

## Key Commands

| Task                     | Command                  | Notes                                       |
| ------------------------ | ------------------------ | ------------------------------------------- |
| **Install**              | `pnpm install`           |                                             |
| **Install**              | `pnpm install`           |                                             |
| **Build (no Rust)**      | `pnpm build.local`       | For a fresh start                           |
| **Build (with Rust)**    | `pnpm build.full`        | Only for optimizer changes                  |
| **Build core only**      | `pnpm build.core`        | Fast — just Qwik + Qwik City + types        |
| **Watch mode**           | `pnpm build.watch`       | Rebuilds on change                          |
| **Unit tests**           | `pnpm test.unit`         | Vitest — runs `packages/**/*.unit.{ts,tsx}` |
| **E2E tests (Chromium)** | `pnpm test.e2e.chromium` | Playwright                                  |
| **E2E tests (City)**     | `pnpm test.e2e.city`     | Qwik City–specific E2E                      |
| **Lint**                 | `pnpm lint`              | ESLint + Prettier + Rust lint               |
| **Lint fix**             | `pnpm lint.fix`          | Auto-fix ESLint issues                      |
| **Format**               | `pnpm fmt`               | Prettier + syncpack                         |
| **Type check**           | `pnpm tsc.check`         | Full TypeScript check                       |
| **Update API docs**      | `pnpm api.update`        | Regenerates public API `.md` files          |
| **Create changeset**     | `pnpm change`            | Interactive — creates `.changeset/*.md`     |
| **Dev server**           | `pnpm serve`             | Port 3300                                   |
| **Docs dev**             | `pnpm docs.dev`          | Documentation site                          |

### Running a Single Test File

```bash
# Unit test — single file
pnpm vitest run packages/qwik/src/core/qrl/qrl.unit.ts

# E2E test — single file
pnpm playwright test starters/e2e/e2e.events.spec.ts --project chromium
```

## Architecture Essentials

### Resumability

Qwik serializes the full application state into HTML at SSR time. On the client, it **resumes** from that serialized state instead of re-executing components (no hydration). The serialization/deserialization logic lives in `packages/qwik/src/core/container/`.

### QRL & the `$` Transform

A **QRL** (Qwik Resource Locator) is a lazy reference to a closure. Any function ending with `$` (e.g., `component$`, `useTask$`, `$()`) creates a QRL boundary — the optimizer extracts these into separate chunks for lazy loading.

- QRL implementation: `packages/qwik/src/core/qrl/`
- The Rust optimizer rewrites `$`-suffixed calls at build time

### Signals

Fine-grained reactivity system. Signals track subscriptions and update only the DOM nodes or tasks that read them — no virtual DOM diffing.

- Implementation: `packages/qwik/src/core/state/signal.ts`
- Stores (proxy-based deep reactivity): `packages/qwik/src/core/state/store.ts`

### Optimizer (Rust)

The optimizer is a Rust-based compiler plugin (SWC transform) that:

1. Extracts `$`-suffixed closures into separate entry points
2. Captures lexical scope for serialization
3. Generates manifest metadata for prefetching

- Rust source: `packages/qwik/src/optimizer/core/`
- WASM build: `packages/qwik/src/wasm/`
- Native bindings: `packages/qwik/src/napi/`

### Qwik City (Meta-framework)

Qwik City provides file-based routing, data loaders (`routeLoader$`), actions (`routeAction$`), middleware, and server adapters.

- Runtime: `packages/qwik-city/src/runtime/`
- Build tooling: `packages/qwik-city/src/buildtime/`
- Adapters: `packages/qwik-city/src/adapters/`

## Code Style

**Config:** Prettier (`.prettierrc.json`) + ESLint 9 flat config (`eslint.config.js`)

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
| `create*`      | Factory functions                                 | `createDOM`, `createContextId`      |
| `*.unit.ts(x)` | Unit test files                                   | `qrl.unit.ts`                       |
| `*.spec.ts`    | E2E test files                                    | `e2e.events.spec.ts`                |

## Testing

### Unit Tests (Vitest)

- File pattern: `*.unit.ts` / `*.unit.tsx`
- Config: `vitest.config.ts` (root)
- Run all: `pnpm test.unit`
- Run one: `pnpm vitest run <path>`
- Server-side DOM helper: `createDOM()` from `@builder.io/qwik/testing`

### E2E Tests (Playwright)

- File pattern: `*.spec.ts` in `starters/e2e/`
- Config: `starters/playwright.config.ts`
- Run: `pnpm test.e2e.chromium`
- Run one: `pnpm playwright test <path> --project chromium`
- Additional E2E suites: `e2e/adapters-e2e/`, `e2e/docs-e2e/`, `e2e/qwik-react-e2e/`

### Rust Tests

- Run: `pnpm test.rust` (or `make test`)
- Update snapshots: `pnpm test.rust.update` (or `make test-update`)

## Git Workflow

### Commit Convention

```
type(scope): description
```

Types: `feat`, `fix`, `docs`, `lint`, `refactor`, `perf`, `test`, `chore`

- Use imperative mood ("add feature" not "added feature")
- No trailing period
- Scope is optional but encouraged (e.g., `fix(qwik-city): ...`)

### Changesets

If your change affects published packages, create a changeset:

```bash
pnpm change
```

This creates a `.changeset/*.md` file describing the change. The core packages (`@builder.io/qwik`, `@builder.io/qwik-city`, `eslint-plugin-qwik`, `create-qwik`) are **fixed-versioned** — they always release together.

### Branch Strategy

- **Base branch:** `main` (trunk-based development)
- PRs target `main`
- CI runs on all PRs

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
6. **Don't edit generated files** — Files in `dist/`, `lib/`, and API docs under `packages/docs/` are generated. Edit the source instead.
