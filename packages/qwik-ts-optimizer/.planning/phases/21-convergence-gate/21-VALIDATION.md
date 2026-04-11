---
phase: 21
slug: convergence-gate
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-11
---

# Phase 21 — Validation Strategy

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
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | CONV-01 | convergence | `npx vitest run tests/optimizer/convergence.test.ts` | ✅ | ⬜ pending |
| 21-01-02 | 01 | 1 | CONV-02 | unit | `npx vitest run` | ✅ | ⬜ pending |
| 21-01-03 | 01 | 1 | CONV-03 | tsc | `npx tsc --noEmit` | ✅ | ⬜ pending |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
