---
phase: 19
slug: jsx-transform-convergence
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-11
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/optimizer/convergence.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/optimizer/convergence.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | JSXR-01 | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_jsx"` | ✅ | ⬜ pending |
| 19-01-02 | 01 | 1 | JSXR-02 | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_props"` | ✅ | ⬜ pending |
| 19-02-01 | 02 | 2 | JSXR-03 | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "spread"` | ✅ | ⬜ pending |
| 19-02-02 | 02 | 2 | JSXR-04 | convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "signal"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements through convergence.test.ts.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
