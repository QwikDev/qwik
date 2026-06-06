---
name: qwik-e2e-verification
description: Use when creating, modifying, debugging, or running Qwik Playwright e2e tests under e2e/, including router, adapters, docs, CLI, and React integration suites.
---

# Qwik E2E Verification

Use this skill for Playwright e2e work in `e2e/**`. Keep the repo-wide rules from
`.ruler/AGENTS.md` in force.

## Fast Path

1. Identify the suite: Qwik core app, Qwik Router, adapters, docs, CLI, or Qwik React.
2. Run the dev rebuild first when testing Qwik runtime/router behavior.
3. Use the suite's Playwright config and the browser-selection style that config expects.
4. Prefer one focused e2e file before broad suite commands.
5. When debugging app fixtures, inspect the matching `e2e/*/apps/` source before changing tests.
6. Turn a failing behavior into the smallest deterministic regression. Avoid sleeps and broad
   assertions when a route, marker, event, or serialized state check can prove the behavior.

## Suites

- Main Qwik e2e: `e2e/qwik-e2e/tests/`
- Router e2e: `e2e/qwik-e2e/tests/qwikrouter/`
- Adapter e2e: `e2e/adapters-e2e/tests/`
- Docs e2e: `e2e/docs-e2e/tests/`
- CLI e2e: `e2e/qwik-cli-e2e/tests/`
- React integration e2e: `e2e/qwik-react-e2e/tests/`

## Commands

Main Qwik e2e config uses `--browser`, not Playwright projects:

```bash
pnpm build.core.dev
pnpm playwright test e2e/qwik-e2e/tests/events.e2e.ts --browser=chromium --config e2e/qwik-e2e/playwright.config.ts
pnpm playwright test e2e/qwik-e2e/tests/qwikrouter/nav.e2e.ts --browser=chromium --config e2e/qwik-e2e/playwright.config.ts
```

Other suites may use named Playwright projects. Check their config before choosing flags:

```bash
pnpm playwright test e2e/docs-e2e/tests/docs-smoke.spec.ts --config e2e/docs-e2e/playwright.config.ts --project chromium
pnpm playwright test e2e/adapters-e2e/tests/adapters.spec.ts --project=chromium --config e2e/adapters-e2e/playwright.config.ts
pnpm playwright test e2e/qwik-react-e2e/tests/reactify.spec.ts --project=chromium --config e2e/qwik-react-e2e/playwright.config.ts
```

## Stop Conditions

- Stop and inspect the suite config when `--browser` versus `--project` is unclear.
- Stop and report if browser binaries, build artifacts, or dependencies are missing.
- Do not broaden to all e2e suites unless the user asks or the changed surface requires it.
- If a test failure shows this skill has stale suite or command guidance, update the skill before
  finishing or record why guidance edits were out of scope.
