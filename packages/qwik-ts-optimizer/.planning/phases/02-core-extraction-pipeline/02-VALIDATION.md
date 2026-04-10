---
phase: 2
slug: core-extraction-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | API-03, IMP-01..03 | — | N/A | unit | `npx vitest run tests/optimizer/rewrite-imports.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | EXTRACT-07 | — | N/A | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | EXTRACT-01 | — | N/A | unit | `npx vitest run tests/optimizer/context-stack.test.ts` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 1 | EXTRACT-01 | — | N/A | unit | `npx vitest run tests/optimizer/marker-detection.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 2 | EXTRACT-02,04,07 IMP-05 | — | N/A | unit | `npx vitest run tests/optimizer/extract.test.ts` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 2 | CALL-01..05 | — | N/A | unit | `npx vitest run tests/optimizer/rewrite-calls.test.ts` | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 3 | EXTRACT-03,05,06 IMP-04,06 | — | N/A | unit | `npx vitest run tests/optimizer/rewrite-parent.test.ts` | ❌ W0 | ⬜ pending |
| 2-05-01 | 05 | 4 | API-01,02 | — | N/A | unit | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 2-05-02 | 05 | 4 | API-01,02 | — | N/A | snapshot | `npx vitest run tests/optimizer/transform.test.ts tests/optimizer/snapshot-batch.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Phase 1 test infrastructure already exists (vitest, snapshot parser, AST compare, batch runner)
- [ ] New test files for extraction, call forms, imports, API

*Existing infrastructure covers framework requirements.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification via snapshot comparison.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
