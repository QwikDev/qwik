---
phase: 16-final-convergence
plan: 05
subsystem: jsx-transform, segment-codegen, transform
tags: [convergence, flags, passive-events, preventdefault, jsx-children]
dependency_graph:
  requires: [segment-const-replacement-pipeline, segment-DCE, segment-qrlDEV, qrl-declaration-ordering]
  provides: [jsx-child-flags-fix, passive-event-prefix-detection, preventdefault-stripping]
  affects: [convergence-tests, segment-output, parent-output]
tech_stack:
  added: []
  patterns: [html-vs-component-child-flags-classification, passive-prefix-detection-from-symbolname, directive-stripping-pipeline]
key_files:
  created: []
  modified:
    - src/optimizer/jsx-transform.ts
    - src/optimizer/segment-codegen.ts
    - src/optimizer/transform.ts
decisions:
  - "JSX child element flags: HTML children without varProps = static (bit 1), component children = dynamic, HTML children with varProps = dynamic"
  - "Passive event prefix detected from symbol name pattern (q_ep_, q_wp_, q_dp_) for segment body rewriting"
  - "passive:* and preventdefault:* JSX directives stripped from both JSX transform and segment body text"
metrics:
  duration: 24min
  completed: "2026-04-11T17:02:00Z"
  tasks: 2
  files: 3
requirements-completed: []
---

# Phase 16 Plan 05: Final Convergence Sweep Summary

JSX child element flags classification fix, passive event prefix detection for segment bodies, and directive stripping -- convergence 69 to 73 (+4 tests, 0 regressions).

## Performance

- **Duration:** 24 min
- **Started:** 2026-04-11T16:38:21Z
- **Completed:** 2026-04-11T17:02:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Fixed JSX child element flags classification: HTML children without varProps treated as static (flags bit 1 set), component children treated as dynamic, HTML children with varProps (loop context) treated as dynamic -- matching Rust optimizer behavior
- Added passive event prefix detection from symbol name pattern for segment body event prop rewriting (q-ep:/q-wp:/q-dp: prefixes)
- Stripped passive:* JSX attribute directives from segment bodies
- Stripped preventdefault:* JSX attribute directives from both JSX transform and segment body text
- Convergence improved from 69 to 73 (+4 tests) with zero regressions
- All 483 unit tests passing (1 pre-existing failure in snapshot batch)
- Zero tsc errors maintained

## Task Commits

Each task was committed atomically:

1. **Task 1: Diagnose and fix JSX flags, passive events, directive stripping** - `4d45fb0` (feat)
2. **Task 2: Strip preventdefault:* directives** - `ccb52eb` (fix)

## Files Created/Modified

- `src/optimizer/jsx-transform.ts` - JSX child element flags classification (static vs dynamic based on tag type and varProps), preventdefault:* directive stripping
- `src/optimizer/segment-codegen.ts` - passive:* and preventdefault:* directive stripping from segment body text
- `src/optimizer/transform.ts` - Passive event prefix detection from symbol name for segment body event prop rewriting

## Decisions Made

- JSX child element flags: HTML element children classified as static (bit 1 set) when they have no varProps, dynamic when they have varProps (from loop context q:p injection). Component element children (uppercase tag like Slot, Cmp) always classified as dynamic. Fragments always static.
- Passive event prefix detection uses symbol name pattern matching (q_ep_, q_wp_, q_dp_) to determine correct event prop prefix (q-ep:, q-wp:, q-dp:) during segment body nested call site rewriting.
- passive:* and preventdefault:* JSX attribute directives are stripped from both the JSX transform pipeline and segment body post-processing, matching Rust optimizer behavior.

## Deviations from Plan

### Task 1: Scope Broader Than Expected

**Plan expected:** Diagnose and categorize all remaining 141 failures, fix at least half.

**Actual:** All 141 failures diagnosed and categorized into 5 buckets (parentOnly: 36, segmentOnly: 70, both: 29, missingSegments: 6, metadataOnly: 0). Targeted fixes applied for 3 high-impact patterns (flags classification, passive prefix, directive stripping). Only 4 tests flipped to passing due to compound failure nature -- most failing tests have 2-5 independent issues that ALL must be fixed before the test passes.

**Impact:** +4 convergence tests (69->73) instead of +70. The compound failure nature means each individual fix contributes to eventual convergence but doesn't flip tests individually.

### Task 2: Remaining Failures Analysis

Investigation revealed the remaining 137 failures fall into these categories:
- **Inlined/hoist strategy** (~30 tests): Tests expect code inlined in parent with .s() calls, but optimizer produces separate segments. Fundamental strategy implementation gap.
- **_qrlSync string serialization** (~5 tests): _qrlSync() calls missing second string argument (serialized function body).
- **Key counter offset** (~8 tests): Segment JSX key counter starts at 0 instead of correct offset from parent module context.
- **_hf hoisted function ordering** (~4 tests): Signal hoisted functions in different order than Rust optimizer.
- **q:p/q:ps missing** (~19 tests): Event handler elements in segments missing loop context parameter injection.
- **Variable migration** (~6 tests): Self-referential QRL patterns and capture vs migration decisions.
- **Capture classification** (~10 tests): Functions/classes being captured instead of migrated; extra imports for captured identifiers.

These require deeper structural changes beyond edge case fixes.

## Test Results

- **Convergence: 73/210 passing** (+4 from 69)
- **Unit tests: 483/484 passing** (1 pre-existing failure)
- **tsc --noEmit: 0 errors**

## Known Stubs

None -- all changes are functional implementations.

## Self-Check: PASSED

All files exist, all commits verified.
