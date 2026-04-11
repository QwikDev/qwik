# Phase 21: Convergence Gate -- Verification Report

**Date:** 2026-04-11
**Milestone:** v3.0 Reference-Guided Convergence

## Gate Outcome: FAIL (below 70% target)

The v3.0 milestone did NOT achieve the 70% convergence target. Convergence reached 76/210 (36.2%), well below the 147/210 (70%) threshold. However, zero regressions were introduced and all unit tests pass after Phase 19 expectation fixes.

## Check Results

| Check | Target | Actual | Status |
|-------|--------|--------|--------|
| CONV-01: Convergence count | 147+/210 (70%) | 76/210 (36.2%) | **FAIL** |
| CONV-02: v2.0 baseline regressions | 0 regressions | 0 regressions (73 baseline + 3 new = 76) | **PASS** |
| CONV-03: Unit test regressions | 0 new failures | 0 new failures (3 pre-existing v2.0 only) | **PASS** |
| tsc --noEmit | 0 errors | 0 errors | **PASS** |

### Check 1 -- Convergence Count (CONV-01)

**Command:** `npx vitest run tests/optimizer/convergence.test.ts`
**Result:** 76 passed, 134 failed (210 total)

- Vitest passes: 76/210
- Real snapshot matches: 74/209 (excludes 1 noInput early-return + 1 summary meta-test)
- Real pass rate: 35.4%
- Target: 147/210 (70%)
- Gap: 71 tests short of target

### Check 2 -- Regression Check (CONV-02)

All 73 v2.0 baseline tests continue to pass. v3.0 added 3 new passing tests (76 total). Zero regressions from any phase (17-20).

### Check 3 -- Unit Test Suite (CONV-03)

**Command:** `npx vitest run`
**Result:** 558 passed, 137 failed (695 total)

Breakdown of 137 failures:
- 134 convergence test failures (expected -- these are the snapshot mismatches being measured)
- 3 pre-existing v2.0 unit test failures:
  - `transform.test.ts`: "loop: for-i loop detected and q:p injected (LOOP-05)"
  - `transform.test.ts`: "loop: parent-level .map() loop injects q:p and loop flag (LOOP-01)"
  - `snapshot-batch.test.ts`: "segments match qwik_core__test__example_immutable_analysis.snap"

The 2 Phase 19 classifyProp test failures were fixed in Task 1 of this phase:
- "returns var for member expression on imported value (styles.foo)" -- now passes
- "puts imported member expression props in varProps" -- now passes

**v3.0 introduced zero new unit test failures.**

### Check 4 -- TypeScript Compilation

**Command:** `npx tsc --noEmit`
**Result:** 0 errors (exit code 0)

## v3.0 Milestone Summary

| Metric | v2.0 Baseline | v3.0 Final | Delta |
|--------|---------------|------------|-------|
| Convergence (vitest) | 73/210 | 76/210 | +3 |
| Real snapshots | 71/209 | 74/209 | +3 |
| Pass rate | 34.0% | 35.4% | +1.4pp |
| Unit tests passing | ~553 | 558 | +5 |
| tsc errors | 0 | 0 | 0 |

### Per-Phase Gains

| Phase | Tests Before | Tests After | Net Gain | Key Achievement |
|-------|-------------|-------------|----------|-----------------|
| Phase 17 | 73 | 73 | 0 | Import ordering (Map insertion order), shared SignalHoister |
| Phase 18 | 73 | 74 | +1 | Alphabetical capture sort, inlinedQrl explicit captures |
| Phase 19 | 74 | 75 | +1 | classifyProp SWC alignment, _createElement fallback |
| Phase 20 | 75 | 76 | +1 | Variable migration scope filtering, _qrlSync serialization |
| **Total** | **73** | **76** | **+3** | |

### v3.0 Infrastructure Improvements (Not Reflected in Convergence Count)

While convergence moved only +3 tests, v3.0 established critical infrastructure prerequisites:

1. **Import ordering** -- Map insertion order matching SWC Vec discovery order
2. **Shared SignalHoister** -- Prevents _hf counter duplication across body transforms
3. **classifyProp alignment** -- Matches SWC is_const.rs (member access and calls always var)
4. **Variable migration filtering** -- Local declarations excluded from rootUsage, declaration-site positions tracked
5. **_qrlSync serialization** -- Paren-depth-aware for segment bodies
6. **CONST_CALL_IDENTS** -- Hardcoded set matching SWC const_idents for known-const function calls
7. **Moved declaration import deps** -- Import re-collection skips moved vars; reexport migration suppresses .w() captures

## Failure Gap Analysis

### Failure Distribution

| Category | Count | Description |
|----------|-------|-------------|
| Parent-only failures | 36 | Parent module AST differs but all segments match |
| Segment-only failures | 68 | Segments differ but parent module matches |
| Both parent + segment fail | 30 | Both parent and segments have mismatches |
| **Total failing** | **134** | |

### Root Cause Families

| Family | Estimated Impact | Description |
|--------|-----------------|-------------|
| const_idents tracking | 25-35 tests | Missing module-scope const binding tracking; blocks flags bitmask, component prop routing, dynamic classification |
| Cross-scope capture delivery | 10-15 tests | _rawProps destructuring, nested $() .w() wrapping, _captures injection patterns |
| Segment body codegen | 15-25 tests | Inline .s() body, hoist const-fn body, signal wrapping in segments |
| Dev mode transforms | 5-10 tests | qrlDEV(), HMR, dev-mode JSX source info |
| Import/export edge cases | 5-10 tests | Extension handling, renamed exports, qwik-react/router import rewriting |

**Note:** Families overlap significantly. A single test can fail due to multiple families. Fixing const_idents alone would likely flip 25-35 tests, making it the highest-leverage improvement.

### Top Root Cause: const_idents Tracking System

The single highest-impact missing feature is the `const_idents` tracking system (SWC maintains a set of identifiers bound to module-scope `const` declarations). This affects:

- `computeFlags` bit 0 (static_listeners): currently uses `!inLoop || !hasVarProps` instead of SWC-aligned `!hasNonConstProp`
- Component vs HTML prop routing: components should default to var bucket, HTML to const
- `_wrapProp` children dynamic classification: depends on binding constness
- Three Phase 19 changes had to be reverted because they caused regressions without const_idents

## Recommendation

The gate does **NOT** pass. The v3.0 milestone should be documented and closed with the following outcomes:

1. **Convergence:** 76/210 (36.2%) -- below 70% target but with zero regressions
2. **Infrastructure:** Significant foundational work completed that enables future convergence gains
3. **Next milestone (v4.0):** Should target const_idents tracking system as centerpiece, which would unlock the largest batch of remaining failures

### v4.0 Estimated Impact

| Fix | Estimated New Passes | Cumulative |
|-----|---------------------|------------|
| const_idents tracking | 25-35 | 101-111 (48-53%) |
| Cross-scope capture delivery | 10-15 | 111-126 (53-60%) |
| Segment body codegen | 15-25 | 126-151 (60-72%) |
| Dev mode + edge cases | 10-20 | 136-171 (65-81%) |

Reaching 70% is achievable in v4.0 with focused implementation of const_idents as the first phase.

## Reproducibility

All numbers in this report were obtained from actual test execution on 2026-04-11. Commands to reproduce:

```bash
# Convergence count
npx vitest run tests/optimizer/convergence.test.ts

# Full test suite
npx vitest run

# TypeScript compilation
npx tsc --noEmit
```
