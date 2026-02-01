# Qwik Vite Environment API Validation

## What This Is

Validation milestone for Qwik's migration to the Vite 7+ Environment API. The core implementation (Phases 1-4) is complete — this milestone focuses on manual validation to ensure dev mode and build mode work correctly with per-environment module graphs before shipping.

## Core Value

Confidence that the Environment API migration works correctly in real-world scenarios — dev mode with multiple environments, build mode with manifest handoff, and no regressions in existing functionality.

## Requirements

### Validated

- ✓ Phase 1: Version detection (`getViteMajorVersion()`) — existing
- ✓ Phase 2: Transform hooks environment-aware (`getIsServer()`) — existing
- ✓ Phase 3: Module graph helpers (`invalidateModuleInEnvironments()`, `getModuleById()`) — existing
- ✓ Phase 4: HMR hook (`hotUpdate` with environment guards) — existing

### Active

- [ ] Dev mode: client environment renders correctly in browser
- [ ] Dev mode: SSR environment renders correctly on server
- [ ] Dev mode: file changes trigger correct environment invalidation and reload
- [ ] Build mode: client build generates manifest
- [ ] Build mode: SSR build consumes client manifest
- [ ] Build mode: production app works end-to-end
- [ ] Existing Playwright e2e tests pass
- [ ] Existing unit tests pass

### Out of Scope

- Playwright + Vite dev server testing infrastructure — future milestone
- REPL/Rolldown validation — has unit test coverage, lower priority
- Advanced HMR (routeLoader$ caching, partial updates) — future work
- Phase 5 (builder.buildApp()) — evaluate after validation
- Phase 6 (Router plugin deep migration) — evaluate after validation

## Context

**Existing research:**
- `ai-docs/research/vite-environment-api/` — 9 documents covering Vite API, framework patterns, migration strategy
- `ai-docs/research/qwik-ssr-hmr-requirements.md` — SSR HMR requirements and patterns
- `ai-docs/research/ssr-hmr-patterns.md` — How other frameworks handle SSR HMR

**Codebase state:**
- `.planning/codebase/` — Architecture, stack, concerns documented
- Implementation in `packages/qwik/src/optimizer/src/plugins/vite.ts` and `plugin.ts`

**Key files modified:**
- `vite.ts`: `getViteMajorVersion()`, version-gated `environments` config, `hotUpdate` hook
- `plugin.ts`: `getIsServer()`, `invalidateModuleInEnvironments()`, `getModuleById()`, `invalidateHotModules()`

## Constraints

- **Backward compatibility**: Rolldown/REPL must still work (no Environment API available)
- **Vite version**: Environment API only enabled for Vite 7+
- **Validation approach**: Manual testing with agent-browser, existing automated tests

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Validate before infrastructure | Ensures we're testing real behavior, not just that tests pass | — Pending |
| Manual validation with agent-browser | E2E tests don't exercise Vite dev server | — Pending |
| Keep HMR minimal for now | Focus on correctness first, advanced HMR later | — Pending |

---
*Last updated: 2025-01-24 after initialization*
