# Codebase Structure

**Analysis Date:** 2026-01-24

## Directory Layout

```
qwik/
├── packages/
│   ├── qwik/                           # Core framework (@qwik.dev/core)
│   │   ├── src/
│   │   │   ├── core/                   # Runtime: components, hooks, reactivity
│   │   │   ├── server/                 # SSR: rendering, streaming, serialization
│   │   │   ├── build/                  # Build metadata exports
│   │   │   ├── cli/                    # CLI commands (create, add, migrate)
│   │   │   ├── optimizer/              # Vite plugin for code extraction
│   │   │   ├── qwikloader.ts           # Client boot script
│   │   │   ├── testing/                # Test utilities
│   │   │   └── devtools/               # Developer tools
│   │   └── dist/                       # Built output (generated)
│   │
│   ├── qwik-router/                    # Routing framework
│   ├── qwik-auth/                      # Authentication helpers
│   ├── qwik-dom/                       # DOM-related utilities
│   ├── qwik-react/                     # React integration
│   ├── qwik-worker/                    # Web Worker utilities
│   ├── qwik-labs/                      # Experimental features
│   │
│   ├── eslint-plugin-qwik/             # ESLint rules for Qwik
│   ├── docs/                           # Documentation site (qwik.dev)
│   ├── insights/                       # Insight analytics dashboard
│   ├── create-qwik/                    # Project scaffolder CLI
│   └── supabase-auth-helpers-qwik/     # Supabase auth integration
│
├── starters/                           # Starter templates
│   ├── apps/                           # Application starters
│   │   ├── base/                       # Minimal starter
│   │   ├── playground/                 # Feature playground
│   │   ├── qwikrouter-test/            # Router test app
│   │   └── todo-test/                  # Todo demo
│   ├── adapters/                       # Deployment adapters
│   │   ├── node-server/
│   │   ├── netlify-edge/
│   │   ├── vercel-edge/
│   │   ├── cloudflare-pages/
│   │   ├── deno/
│   │   ├── firebase/
│   │   ├── aws-lambda/
│   │   └── ssg/                        # Static site generation
│   └── features/                       # Feature integrations
│       ├── tailwind/
│       ├── vitest/
│       ├── drizzle/
│       ├── auth/
│       └── (20+ other features)
│
├── e2e/                                # End-to-end tests
│   ├── adapters-e2e/                   # Adapter integration tests
│   ├── docs-e2e/                       # Documentation site tests
│   ├── qwik-cli-e2e/                   # CLI tests
│   └── qwik-react-e2e/                 # React integration tests
│
├── .planning/codebase/                 # GSD analysis documents
├── .agents/skills/                     # Agent automation scripts
├── scripts/                            # Build and utility scripts
└── contributing/                       # Contribution guidelines
```

## Directory Purposes

**`packages/qwik/src/core/`:**
- Purpose: Core reactive runtime and component system
- Contains: Components, lifecycle hooks, signals, JSX, client rendering
- Key files: `component.public.ts`, `index.ts` (exports)

**`packages/qwik/src/core/client/`:**
- Purpose: Client-side hydration, DOM reconciliation, event delegation
- Contains: DOM container, vnode diffing, event listener setup
- Key files: `dom-container.ts`, `vnode-diff.ts`, `vnode-utils.ts`

**`packages/qwik/src/core/shared/`:**
- Purpose: Shared abstractions used by client and server
- Contains: QRL, JSX runtime, serialization, error handling
- Key files: `component.public.ts`, `qrl/`, `jsx/`, `serdes/`

**`packages/qwik/src/core/shared/jsx/`:**
- Purpose: JSX runtime and type definitions
- Contains: `jsx()`, `h()`, Fragment, Slot, event handlers
- Key files: `jsx-runtime.ts`, `types/jsx-*.ts`

**`packages/qwik/src/core/shared/qrl/`:**
- Purpose: QRL (Qwik Resource Locator) system for lazy-loading
- Contains: QRL class, creation, resolution, serialization
- Key files: `qrl-class.ts`, `qrl.public.ts`

**`packages/qwik/src/core/shared/serdes/`:**
- Purpose: Serialization and deserialization of state
- Contains: State marshaling, symbol tracking, proxy unwrapping
- Key files: `deser.ts`, `verify.ts` (noSerialize)

**`packages/qwik/src/core/reactive-primitives/`:**
- Purpose: Signal-based reactivity system
- Contains: Signal interface, computed signals, cleanup tracking
- Key files: `signal-api.ts`, `signal.public.ts`, `internal-api.ts`

**`packages/qwik/src/core/use/`:**
- Purpose: Hooks API for components
- Contains: useStore, useSignal, useTask, useVisibleTask, useResource, useContext, useOn, etc.
- Pattern: Each hook in separate file (use-*.ts); dollar variant in use-*-dollar.ts

**`packages/qwik/src/server/`:**
- Purpose: Server-side rendering and streaming
- Contains: SSR container, HTML generation, manifest handling, preloading
- Key files: `ssr-container.ts`, `ssr-render.ts`, `index.ts`

**`packages/qwik/src/optimizer/`:**
- Purpose: Vite plugin that transforms code for lazy-loading
- Contains: Transform logic for `$()` markers, chunk extraction, manifest generation
- Key files: Plugin entry point (varies by build config)

**`packages/qwik/src/cli/`:**
- Purpose: Command-line interface tools
- Contains: `create`, `add`, `migrate-v2` commands
- Key files: `run.ts` (entry), subdirectories for each command

**`packages/qwik/src/testing/`:**
- Purpose: Test utilities and helpers
- Contains: DOM simulation, test containers, assertions
- Key files: Varies by framework (Vitest/Jest/Playwright integration)

**`packages/qwik-router/`:**
- Purpose: File-based routing system
- Contains: Route matching, layouts, loaders, actions
- Key files: `buildtime/` for build-time route generation, `runtime/` for route resolution

**`starters/adapters/`:**
- Purpose: Deployment adapter templates
- Location: One directory per target platform
- Key files: `vite.config.ts`, middleware implementation files

**`e2e/`:**
- Purpose: End-to-end integration tests
- Contains: Playwright/Cypress tests for full feature validation
- Key files: `tests/` subdirectories with `*.e2e.ts` or `*.spec.ts` files

## Key File Locations

**Entry Points:**

- `packages/qwik/src/core/index.ts`: Core framework exports (component$, hooks, JSX)
- `packages/qwik/src/server/index.ts`: Server rendering exports (renderToString, renderToStream)
- `packages/qwik/src/qwikloader.ts`: Client boot script loaded in browser
- `packages/qwik/src/cli/index.ts`: CLI command handlers

**Configuration:**

- `packages/qwik/package.json`: Framework package metadata, exports map
- `tsconfig.json` (root): TypeScript configuration
- `packages/qwik/src/optimizer/` (config varies): Vite plugin configuration

**Core Logic:**

- `packages/qwik/src/core/shared/component.public.ts`: Component factory and types
- `packages/qwik/src/core/reactive-primitives/signal-api.ts`: Signal implementation
- `packages/qwik/src/core/shared/qrl/qrl-class.ts`: QRL class and operations
- `packages/qwik/src/core/client/dom-container.ts`: Client-side container and hydration
- `packages/qwik/src/server/ssr-container.ts`: Server-side rendering container

**Testing:**

- `packages/qwik/src/core/tests/`: Core framework unit tests
- `e2e/` (root-level): Integration and end-to-end tests
- `packages/qwik/src/core/*.unit.ts`: Colocated unit tests

## Naming Conventions

**Files:**

- `*.ts`: TypeScript source
- `*.tsx`: TypeScript + JSX
- `*.public.ts`: Public API exports (used by applications)
- `*.unit.ts`: Unit tests (colocated with source)
- `*-dollar.ts`: Variant that supports `$()` syntax (e.g., `use-task-dollar.ts` wraps `use-task.ts`)
- `index.ts`: Barrel export file for directory

**Directories:**

- Plural names for feature groupings: `hooks/`, `adapters/`, `features/`
- Feature name matches exported function/component: `use-store/` directory contains `use-store.ts`
- Prefixes for internal/utility: `shared/`, `utils/` for cross-cutting code

**Functions/Exports:**

- Public: `component$`, `useTask$`, `useStore` (PascalCase for components, camelCase for hooks)
- Internal: Leading underscore `_jsxSplit`, `_SubscriptionData`
- Dollar variants: `component$`, `useTask$`, `useResource$` (optimizer-transformed)

## Where to Add New Code

**New Feature (Component + Logic):**
- Implementation: `packages/qwik/src/core/` (if core feature) or `packages/qwik-*/` (if addon)
- Tests: Colocated `*.unit.ts` file same directory as source
- Exports: Add to relevant `index.ts` barrel file

**New Hook (useMyHook):**
- Implementation: Create `packages/qwik/src/core/use/use-my-hook.ts`
- Dollar variant: Create `packages/qwik/src/core/use/use-my-hook-dollar.ts` if optimizer transformation needed
- Tests: `packages/qwik/src/core/use/use-my-hook.unit.ts`
- Export: Add to `packages/qwik/src/core/index.ts`

**New Utility/Shared:**
- General utilities: `packages/qwik/src/core/shared/utils/`
- QRL-related: `packages/qwik/src/core/shared/qrl/`
- Serialization: `packages/qwik/src/core/shared/serdes/`
- JSX-related: `packages/qwik/src/core/shared/jsx/`

**New Starter/Template:**
- App template: Create in `starters/apps/{name}/` with `src/`, `package.json`, `qwik.config.ts`
- Feature integration: Create in `starters/features/{name}/` with integration patches
- Adapter: Create in `starters/adapters/{name}/` with vite config and middleware

**Adapter Implementation:**
- New platform: Create `starters/adapters/{platform-name}/` with vite plugin
- Middleware: Implement `middleware/` functions for request/response handling
- Example: `starters/adapters/node-server/` contains Vite config + Express middleware

**Tests:**
- Unit: Colocated `*.unit.ts` in same directory as source
- Integration: Add to `e2e/` directory, use Playwright/Cypress
- Test utilities: `packages/qwik/src/testing/`

## Special Directories

**`packages/qwik/dist/`:**
- Purpose: Build output (compiled JavaScript, type definitions, source maps)
- Generated: Yes (via build script `npm run build`)
- Committed: No (added to .gitignore)
- Contains: Bundled core.mjs, server exports, d.ts type definitions

**`packages/qwik/bindings/`:**
- Purpose: Native bindings (WASM, NAPI)
- Generated: Yes (via native build process)
- Committed: No (or pre-built binaries only)
- Contains: Optimizer and other performance-critical components

**`temp/` (root-level):**
- Purpose: Temporary build artifacts
- Generated: Yes (build system)
- Committed: No
- Contains: Tarballs, cached bindings

**`node_modules/`:**
- Purpose: Installed dependencies
- Generated: Yes (pnpm install)
- Committed: No
- Lockfile: `pnpm-lock.yaml`

---

*Structure analysis: 2026-01-24*
