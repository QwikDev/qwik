# Roadmap: Qwik Vite Environment API Validation

**Created:** 2025-01-24
**Core Value:** Confidence that the Environment API migration works correctly with Vite 7+

## Overview

| Phase | Name | Goal | Requirements |
|-------|------|------|--------------|
| 1 | Environment API Activation | Verify Environment API is active and configured | ENV-01, ENV-02, ENV-03 |
| 2 | Dev Mode Validation | Validate dev server uses per-environment module graphs | DEV-01, DEV-02, DEV-03, DEV-04 |
| 3 | Build Mode Validation | Validate production build pipeline with manifest handoff | BUILD-01, BUILD-02, BUILD-03 |
| 4 | Regression Testing | Ensure no regressions in existing tests | REG-01, REG-02 |

## Phase Details

### Phase 1: Environment API Activation

**Goal:** Verify Vite 7+ Environment API is detected and the `environments` config is applied correctly.

**Requirements:** ENV-01, ENV-02, ENV-03

**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Run unit tests, verify hook environment usage, create verification report

**Success Criteria:**
1. Dev server logs show Vite 7+ detected
2. `server.environments.client` exists with `consumer: 'client'`
3. `server.environments.ssr` exists with `consumer: 'server'`
4. Plugin hooks receive `this.environment` in dev mode

**Validation Method:** Run existing unit tests, verify plugin hook implementation

---

### Phase 2: Dev Mode Validation

**Goal:** Validate the dev server correctly uses per-environment module graphs for client and SSR.

**Requirements:** DEV-01, DEV-02, DEV-03, DEV-04

**Success Criteria:**
1. App renders in browser (client environment working)
2. SSR response contains server-rendered HTML
3. File change triggers `hotUpdate` hook (verify with debug logging)
4. Browser reloads via `this.environment.hot.send()`
5. Module invalidation uses environment-specific graphs

**Validation Method:** Manual testing with agent-browser on a Qwik app

---

### Phase 3: Build Mode Validation

**Goal:** Validate production build pipeline works with Environment API — client builds manifest, SSR consumes it.

**Requirements:** BUILD-01, BUILD-02, BUILD-03

**Success Criteria:**
1. `pnpm build` completes without errors
2. `dist/q-manifest.json` generated with correct structure
3. SSR build reads manifest and embeds it
4. Production preview serves working app

**Validation Method:** Build a Qwik app, inspect outputs, run preview

---

### Phase 4: Regression Testing

**Goal:** Ensure existing test suites pass with the Environment API changes.

**Requirements:** REG-01, REG-02

**Success Criteria:**
1. All Playwright e2e tests pass
2. All unit tests pass
3. No new warnings or errors in test output

**Validation Method:** Run existing test commands

---

## Dependencies

```
Phase 1 ─┬─► Phase 2 ─┬─► Phase 4
         │            │
         └─► Phase 3 ─┘
```

- Phase 1 must complete first (verify Environment API is active)
- Phases 2 and 3 can run in parallel after Phase 1
- Phase 4 runs after both 2 and 3 complete

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Environment API not activating | Check Vite version, verify `getViteMajorVersion()` |
| Legacy paths still being used | Add debug logging to confirm new paths |
| Build order issues | Verify manifest exists before SSR build reads it |

---
*Roadmap created: 2025-01-24*
