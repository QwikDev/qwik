---
phase: 17
slug: inline-hoist-strategy-convergence
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-11
---

# Phase 17 — Validation Strategy

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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | IHS-01 | — | N/A | snapshot convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_inlined_entry_strategy"` | ✅ | ⬜ pending |
| 17-01-02 | 01 | 1 | IHS-02 | — | N/A | snapshot convergence | `npx vitest run tests/optimizer/convergence.test.ts -t "example_mutable_children"` | ✅ | ⬜ pending |
| 17-01-03 | 01 | 1 | IHS-03 | — | N/A | snapshot convergence | `npx vitest run tests/optimizer/convergence.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements through convergence.test.ts.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
