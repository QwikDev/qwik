---
name: qwik-router-development
description: Use when modifying or reviewing Qwik Router code under packages/qwik-router, including runtime routing, buildtime route generation, middleware, adapters, SSG, markdown/MDX handling, or router tests.
---

# Qwik Router Development

Use this skill for `packages/qwik-router/**` work. Keep the repo-wide rules from `.ruler/AGENTS.md`
in force.

## Fast Path

1. Classify the touched router surface before editing: runtime, buildtime, middleware, adapter, SSG,
   markdown/MDX, or Vite integration.
2. Read the smallest source file plus the closest `*.unit.ts` or `*.spec.ts` file before changing
   behavior.
3. For middleware, loader, action, or navigation changes, trace handler ordering and shared state
   from request creation through response/client consumption before editing.
4. For unit/spec coverage, run `pnpm vitest run <path>`.
5. For browser/router behavior, rebuild first with `pnpm build.core.dev`, then use the focused
   Qwik Router e2e command.
6. If public router API markdown changes are expected, run `pnpm api.update` after tests pass.

## Source Map

- Runtime: `packages/qwik-router/src/runtime/src/`
- Buildtime route generation: `packages/qwik-router/src/buildtime/`
- Vite integration: `packages/qwik-router/src/buildtime/vite/`
- Middleware: `packages/qwik-router/src/middleware/`
- Adapters: `packages/qwik-router/src/adapters/`
- SSG: `packages/qwik-router/src/ssg/`
- Router e2e tests: `e2e/qwik-e2e/tests/qwikrouter/`

## Verification

Use the closest command that covers the changed surface:

```bash
pnpm vitest run packages/qwik-router/src/buildtime/routing/parse-pathname.unit.ts
pnpm vitest run packages/qwik-router/src/runtime/src/client-navigate.unit.ts
pnpm build.core.dev
pnpm playwright test e2e/qwik-e2e/tests/qwikrouter/nav.e2e.ts --browser=chromium --config e2e/qwik-e2e/playwright.config.ts
```

Do not use `--project chromium` with `e2e/qwik-e2e/playwright.config.ts`; this config expects the
`--browser=chromium` flag.

## Quality Bar

- Keep middleware, loader, and action ordering explicit. Do not add broad fallbacks that hide which
  module owns a request.
- Add regression tests for the exact route shape or request mode that failed, such as index route,
  layout loader, page loader, redirect, action, or SPA navigation.
- When changing serialized route state or loader data, update both server output and client
  consumption in the same change.
- Preserve deprecated Qwik City compatibility only when current source still supports it, and keep
  compatibility warnings/tests intentional.
- If router work exposes stale guidance here or in `.ruler/AGENTS.md`, update the guidance before
  finishing or record why guidance edits were out of scope.

## Stop Conditions

- Stop and inspect the generated API workflow before hand-editing any `*.api.md` file.
- Stop and switch to `qwik-e2e-verification` when most of the work is Playwright setup/debugging.
- Stop and run `pnpm api.update` if exported router API changed.
