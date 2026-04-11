# Roadmap: Qwik Optimizer (TypeScript)

## Milestones

- v1.0 Core Optimizer (Phases 1-6) -- shipped 2026-04-10
- v2.0 Snapshot Convergence (Phases 7-16) -- shipped 2026-04-11, 73/210 (35%)
- v3.0 Reference-Guided Convergence (Phases 17-21) -- in progress

## Phases

<details>
<summary>v1.0 Core Optimizer (Phases 1-6) -- SHIPPED 2026-04-10</summary>

### Phase 1: Test Infrastructure and Hash Verification
**Plans**: 3 plans (complete)

### Phase 2: Core Extraction Pipeline
**Plans**: 5 plans (complete)

### Phase 3: Capture Analysis and Variable Migration
**Plans**: 3 plans (complete)

### Phase 4: JSX, Signals, Events, and Loops
**Plans**: 7 plans (complete)

### Phase 5: Entry Strategies and Build Modes
**Plans**: 3 plans (complete)

### Phase 6: Diagnostics and Edge Cases
**Plans**: 3 plans (complete)

</details>

<details>
<summary>v2.0 Snapshot Convergence (Phases 7-16) -- SHIPPED 2026-04-11</summary>

### Phase 7: Parent Rewrite Batch 1
**Plans**: 5 plans (complete)

### Phase 8: Parent Rewrite Batch 2
**Plans**: 5 plans (complete)

### Phase 9: Untransformed Extraction
**Plans**: 3 plans (complete)

### Phase 10: Segment Identity Batch 1
**Plans**: 3 plans (complete)

### Phase 11: Segment Identity Batch 2
**Plans**: 3 plans (complete)

### Phase 12: Segment Identity Batch 3
**Plans**: 3 plans (complete)

### Phase 13: Segment Codegen Batch 1
**Plans**: 3 plans (complete)

### Phase 14: Segment Codegen Batch 2
**Plans**: 3 plans (complete)

### Phase 15: Segment Codegen Batch 3
**Plans**: 3 plans (complete)

### Phase 16: Final Convergence
**Plans**: 5 plans (complete)

</details>

### v3.0 Reference-Guided Convergence (In Progress)

**Milestone Goal:** Reach 70%+ snapshot convergence (147+/210) by fixing the 7 identified failure families using SWC reference source as behavioral guide. Starting from 73/210 (35%).

**Phase Numbering:**
- Integer phases (17, 18, ...): Planned milestone work
- Decimal phases (17.1, 17.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 17: Inline/Hoist Strategy Convergence** - Fix .s() body text and hoist const-fn pattern to match SWC behavioral rules (completed 2026-04-11)
- [x] **Phase 18: Capture Classification Convergence** - Fix paramNames padding, _captures/.w() delivery, and capture metadata (completed 2026-04-11)
- [x] **Phase 19: JSX Transform Convergence** - Fix flags bitmask, prop classification, _jsxSplit, and signal wrapping placement (completed 2026-04-11)
- [x] **Phase 20: Migration and Sync Convergence** - Fix variable move/reexport decisions and _qrlSync serialization (completed 2026-04-11)
- [x] **Phase 21: Convergence Gate** - Validate 147+/210 pass rate with zero regressions (completed 2026-04-11)

## Phase Details

### Phase 17: Inline/Hoist Strategy Convergence
**Goal**: Inline and hoist entry strategies produce AST-matching output for all affected snapshots
**Depends on**: Nothing (first phase of v3.0)
**Requirements**: IHS-01, IHS-02, IHS-03
**Success Criteria** (what must be TRUE):
  1. Running convergence tests on inline-strategy snapshots produces zero .s() body AST mismatches
  2. Running convergence tests on hoist-strategy snapshots produces zero const-fn pattern AST mismatches
  3. Entry strategy selection assigns the correct strategy per snapshot (no strategy misidentification)
  4. All 73 previously-passing snapshots still pass (zero regressions)
**Plans:** 2/2 plans complete

Plans:
- [x] 17-01-PLAN.md -- Fix import ordering to use Map insertion order (matching SWC discovery order)
- [x] 17-02-PLAN.md -- Fix _hf deduplication via shared SignalHoister + suppress _captures import for inline

### Phase 18: Capture Classification Convergence
**Goal**: Capture delivery mechanism (params vs _captures vs .w()) matches SWC behavioral rules for all loop and cross-scope patterns
**Depends on**: Phase 17
**Requirements**: CAP-01, CAP-02, CAP-03
**Success Criteria** (what must be TRUE):
  1. Loop-local variables appear as function parameters with correct positional padding (_,_1,_2) in segment output
  2. Cross-scope captures appear via _captures array access in segment bodies and .w() wrapping in parent QRL references
  3. Segment metadata (captures, captureNames, paramNames arrays) matches snapshot expected metadata exactly
  4. All previously-passing snapshots still pass (zero regressions)
**Plans:** 2/2 plans complete

Plans:
- [x] 18-01-PLAN.md -- Fix alphabetical sort for paramNames slots and cross-scope capture delivery
- [x] 18-02-PLAN.md -- Validate and fix remaining capture metadata mismatches

### Phase 19: JSX Transform Convergence
**Goal**: JSX output (_jsxSorted, _jsxSplit, signal wrapping) matches SWC behavioral rules for all JSX-heavy snapshots
**Depends on**: Phase 18
**Requirements**: JSXR-01, JSXR-02, JSXR-03, JSXR-04
**Success Criteria** (what must be TRUE):
  1. Flags bitmask values in _jsxSorted/_jsxC calls match snapshot expected values for all JSX snapshots
  2. Props land in correct var/const buckets producing AST-matching _jsxSorted arguments
  3. Spread-prop elements produce correct _jsxSplit with _getVarProps/_getConstProps matching snapshot output
  4. _wrapProp and _fnSignal calls appear at correct positions in both parent and segment output
  5. All previously-passing snapshots still pass (zero regressions)
**Plans:** 2/2 plans complete

Plans:
- [x] 19-01-PLAN.md -- Fix flags bitmask swap and align classifyProp with SWC is_const
- [x] 19-02-PLAN.md -- Add _createElement fallback for spread+key and fix signal wrapping edge cases

### Phase 20: Migration and Sync Convergence
**Goal**: Variable migration decisions and _qrlSync serialization match SWC behavioral rules
**Depends on**: Phase 19
**Requirements**: MIGR-01, MIGR-02, MIGR-03, SYNC-01
**Success Criteria** (what must be TRUE):
  1. Variables are moved to segments or kept in parent with _auto_ re-exports matching snapshot expected output
  2. Destructured binding migration produces correct segment imports and body AST
  3. _qrlSync() calls produce AST-matching output for all sync-related snapshots
  4. All previously-passing snapshots still pass (zero regressions)
**Plans:** 2/2 plans complete

Plans:
- [x] 20-01-PLAN.md -- Fix variable migration decisions (computeSegmentUsage filtering + moved decl import deps)
- [x] 20-02-PLAN.md -- Fix _qrlSync serialization in segments + classifyProp const_idents special-cases

### Phase 21: Convergence Gate
**Goal**: Validate that v3.0 work achieves 70%+ convergence with zero regressions
**Depends on**: Phase 20
**Requirements**: CONV-01, CONV-02, CONV-03
**Success Criteria** (what must be TRUE):
  1. convergence.test.ts reports 147+/210 passing (70%+ pass rate)
  2. All 73 previously-passing tests still pass (zero regressions from v2.0 baseline)
  3. All unit tests pass with zero regressions
  4. `npx tsc --noEmit` produces zero errors
**Plans**: 1 plan

Plans:
- [x] 21-01-PLAN.md — Run convergence gate checks, fix Phase 19 test expectations, produce gate report

## Progress

**Execution Order:**
Phases execute in numeric order: 17 -> 18 -> 19 -> 20 -> 21

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 17. Inline/Hoist Strategy Convergence | 2/2 | Complete    | 2026-04-11 |
| 18. Capture Classification Convergence | 2/2 | Complete    | 2026-04-11 |
| 19. JSX Transform Convergence | 2/2 | Complete    | 2026-04-11 |
| 20. Migration and Sync Convergence | 2/2 | Complete    | 2026-04-11 |
| 21. Convergence Gate | 1/1 | Complete    | 2026-04-11 |
