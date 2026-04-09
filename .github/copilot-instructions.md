# Qwik — Copilot Cloud Agent Instructions

> This file tells a Copilot cloud agent how to work efficiently in this repository.
> For full contributor details see [CONTRIBUTING.md](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md).

---

## What This Repo Is

Qwik is a **resumable** web framework. It serializes application and framework state into HTML at SSR time and **resumes** on the client without re-executing component code (no hydration). Developers write reactive code similar to other frameworks; the app is instant regardless of how much JavaScript is present.

**Core concepts:** Resumability, QRLs (lazy-loading primitives), the `$`-suffix transform, fine-grained signals, Rust-based optimizer.

---

## Monorepo Structure

| Package                     | Path                            | Description                              |
| --------------------------- | ------------------------------- | ---------------------------------------- |
| `@builder.io/qwik`          | `packages/qwik`                 | Core framework (runtime + optimizer)     |
| `@builder.io/qwik-city`     | `packages/qwik-city`            | Meta-framework (routing, loaders, adapters) |
| `@builder.io/qwik-react`    | `packages/qwik-react`           | React integration layer                  |
| `@builder.io/qwik-auth`     | `packages/qwik-auth`            | Auth.js integration                      |
| `@builder.io/qwik-dom`      | `packages/qwik-dom`             | Server-side DOM implementation           |
| `@builder.io/qwik-worker`   | `packages/qwik-worker`          | Web Worker support (experimental)        |
| `@builder.io/qwik-labs`     | `packages/qwik-labs`            | Experimental features (private)          |
| `eslint-plugin-qwik`        | `packages/eslint-plugin-qwik`   | ESLint rules for Qwik                    |
| `create-qwik`               | `packages/create-qwik`          | Project scaffolding CLI                  |
| `qwik-docs`                 | `packages/docs`                 | Documentation site (private)             |
| `insights`                  | `packages/insights`             | Analytics dashboard (private)            |

Other notable directories:

- `starters/` — starter templates and E2E test entry points
- `scripts/` — monorepo build orchestration (TypeScript)
- `e2e/` — additional E2E suites (adapters, qwik-react, docs)
- `packages/qwik/src/optimizer/core/` — Rust optimizer source
- `.changeset/` — changeset files for versioning

---

## Prerequisites and Setup

**Required versions:** Node ≥ 22.18.0, pnpm ≥ 10.14.0

```bash
pnpm install
pnpm build.local   # builds everything, copies Rust optimizer from npm (no Rust toolchain needed)
```

Use `pnpm build.full` **only** if you modified Rust/optimizer code (requires Rust + wasm-pack).

---

## Essential Commands

| Task | Command | Notes |
|------|---------|-------|
| Install deps | `pnpm install` | |
| Build (no Rust) | `pnpm build.local` | Full build for a fresh start |
| Build (with Rust) | `pnpm build.full` | Only needed after Rust changes |
| Build core only | `pnpm build.core` | Fast — Qwik + Qwik City + types |
| Build specific packages | `pnpm build --qwik --qwikcity --dev` | Skips type-check & generating |
| Watch mode | `pnpm build.watch` | Rebuilds on change |
| Unit tests | `pnpm test.unit` | Vitest — runs all `*.unit.{ts,tsx}` |
| Single unit test | `pnpm vitest run <path>` | e.g. `packages/qwik/src/core/qrl/qrl.unit.ts` |
| E2E tests (Chromium) | `pnpm test.e2e.chromium` | Playwright |
| E2E tests (Qwik City) | `pnpm test.e2e.city` | |
| Single E2E test | `pnpm playwright test <path> --project chromium` | |
| Lint | `pnpm lint` | ESLint + Prettier + Rust lint |
| Lint fix | `pnpm lint.fix` | Auto-fix ESLint issues |
| Format | `pnpm fmt` | Prettier + syncpack |
| Type check | `pnpm tsc.check` | Full TypeScript check |
| Update API docs | `pnpm api.update` | Regenerates public API `.md` files |
| Create changeset | `pnpm change` | Interactive — creates `.changeset/*.md` |
| Dev server | `pnpm serve` | Port 3300 |
| Docs dev | `pnpm docs.dev` | Documentation site |
| Rust tests | `pnpm test.rust` | or `make test` |
| Update Rust snapshots | `pnpm test.rust.update` | or `make test-update` |

### `pnpm build` flags reference

Run `pnpm build` with no args to list available flags. Common ones:

- `--dev` — skip type-checking and generating (faster iteration)
- `--tsc` — build types
- `--api` — build API docs and type bundles (requires `--tsc`)
- `--build` — build Qwik core
- `--qwikcity` — build Qwik City
- `--qwikreact` — build Qwik React
- `--qwiklabs` — build Qwik Labs
- `--eslint` — build ESLint plugin

---

## Architecture Essentials

### Resumability

Qwik serializes full application state into HTML at SSR time. On the client it resumes from that state — no re-execution of components. Serialization/deserialization logic: `packages/qwik/src/core/container/`.

### QRLs and the `$` Transform

A **QRL** (Qwik Resource Locator) is a lazy reference to a closure. Any function suffixed with `$` (e.g., `component$`, `useTask$`, `$()`) creates a QRL boundary — the Rust optimizer extracts these into separate lazy-loaded chunks.

- QRL implementation: `packages/qwik/src/core/qrl/`
- The Rust optimizer rewrites `$`-suffixed calls at build time

### Signals

Fine-grained reactivity; signals track subscriptions and update only DOM nodes or tasks that read them — no virtual DOM diffing.

- `packages/qwik/src/core/state/signal.ts`
- Stores (proxy-based deep reactivity): `packages/qwik/src/core/state/store.ts`

### Optimizer (Rust)

SWC-based Rust compiler plugin that:
1. Extracts `$`-suffixed closures into separate entry points
2. Captures lexical scope for serialization
3. Generates manifest metadata for prefetching

- Rust source: `packages/qwik/src/optimizer/core/`
- WASM build: `packages/qwik/src/wasm/`
- Native bindings: `packages/qwik/src/napi/`

### Qwik City (Meta-framework)

File-based routing, data loaders (`routeLoader$`), actions (`routeAction$`), middleware, and server adapters.

- Runtime: `packages/qwik-city/src/runtime/`
- Build tooling: `packages/qwik-city/src/buildtime/`
- Adapters: `packages/qwik-city/src/adapters/`

---

## Code Style

**Config:** Prettier (`.prettierrc.json`) + ESLint 9 flat config (`eslint.config.js`)

| Rule | Setting |
|------|---------|
| Semicolons | `true` |
| Quotes | Single |
| Print width | 100 |
| Indentation | 2 spaces |
| Trailing comma | ES5 |
| `no-console` | Error (warn/error allowed) |
| `curly` | Always required |

### Naming Conventions

| Pattern | Usage | Example |
|---------|-------|---------|
| `use*` | Hooks (called in component or task scope) | `useSignal`, `useStore`, `useTask$` |
| `*$` | QRL boundary — optimizer extracts the closure | `component$`, `routeLoader$` |
| `create*` | Factory functions | `createDOM`, `createContextId` |
| `*.unit.ts(x)` | Unit test files | `qrl.unit.ts` |
| `*.spec.ts` | E2E test files | `e2e.events.spec.ts` |

---

## Testing

### Unit Tests (Vitest)

- File pattern: `*.unit.ts` / `*.unit.tsx`
- Config: `vitest.config.ts` (root)
- Run all: `pnpm test.unit`
- Run one file: `pnpm vitest run <path>`
- Server-side DOM helper: `createDOM()` from `@builder.io/qwik/testing`
- Setup file: `vitest-setup.ts`

### E2E Tests (Playwright)

- File pattern: `*.spec.ts` in `starters/e2e/`
- Config: `starters/playwright.config.ts`
- Run all: `pnpm test.e2e.chromium`
- Run one: `pnpm playwright test <path> --project chromium`
- Additional suites: `e2e/adapters-e2e/`, `e2e/docs-e2e/`, `e2e/qwik-react-e2e/`

### Rust Tests

- Run: `pnpm test.rust` (or `make test`)
- Update snapshots: `pnpm test.rust.update` (or `make test-update`)

---

## Git and PR Workflow

### Branch Strategy

- Base branch: `main` (trunk-based development)
- All PRs target `main`
- CI runs on every PR

### Commit Convention

```
type(scope): description
```

Types: `feat`, `fix`, `docs`, `lint`, `refactor`, `perf`, `test`, `chore`

- Use imperative mood ("add" not "added")
- No trailing period
- Scope is optional but encouraged (e.g., `fix(qwik-city): ...`)

### Changesets

Any user-facing change to a published package needs a changeset. The core packages (`@builder.io/qwik`, `@builder.io/qwik-city`, `eslint-plugin-qwik`, `create-qwik`) are **fixed-versioned** — they always release together.

```bash
pnpm change   # interactive prompt; creates .changeset/*.md
```

CI will fail on PRs that touch published packages but lack a changeset.

### PR Checklist (before pushing)

1. `pnpm build.core` — verify build succeeds
2. `pnpm test.unit` — run relevant unit tests
3. `pnpm lint` — fix lint issues
4. `pnpm api.update` — **required** if any public API changed
5. `pnpm change` — add changeset for user-facing changes

---

## What NOT to Do

1. **Don't run `pnpm test`** — this runs the full build + all tests and takes a very long time. Use `pnpm test.unit` or target individual files instead.
2. **Don't skip `pnpm api.update`** — if you changed any public API, CI will fail without regenerated API docs.
3. **Don't modify Rust code without rebuilding** — after touching `packages/qwik/src/optimizer/core/`, run `pnpm build.full` (requires Rust toolchain + wasm-pack).
4. **Don't skip changesets for user-facing changes** — CI checks for them.
5. **Don't commit `.only` tests** — the `no-only-tests` ESLint rule blocks this.
6. **Don't edit generated files** — files in `dist/`, `lib/`, and API docs under `packages/docs/` are generated; edit the source instead.
7. **Don't use `console.log`** — use `console.warn` or `console.error`; `console.log` is an ESLint error.

---

## Known Issues and Workarounds

- **`api.update` diffs after `build.local`** — After running `pnpm build.local` you may see Git diffs for API-related files and `JSXNode`. Run `pnpm api.update` to resolve them before committing.
- **CI merges `main` before running** — Every PR is automatically merged with `main` before CI runs. If CI checks fail, first merge `main` into your branch, then re-run `pnpm api.update` and `pnpm build.local`.
- **Dev Container on Windows** — The Dev Container may not work correctly on Windows due to volume permission differences. Use Mac or Linux instead.
- **pnpm enforcement** — The `preinstall` script runs `only-allow pnpm`. You must use pnpm; npm/yarn/bun will be rejected at install time.
- **Node version** — `.node-version` pins Node 24. Use nvm, fnm, or Nix to match the exact version.
