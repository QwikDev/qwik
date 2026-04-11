---
phase: 16-final-convergence
plan: 01
subsystem: segment-codegen
tags: [segment-codegen, capture-wiring, signal-wrapping, w-call]
dependency_graph:
  requires: []
  provides: [segment-body-w-wiring, segment-section-ordering]
  affects: [convergence-tests, segment-output]
tech_stack:
  added: []
  patterns: [component-scope-w-hoisting, section-ordering]
key_files:
  created: []
  modified:
    - src/optimizer/segment-codegen.ts
decisions:
  - "Component-scope captures injected before return statement, not at function body opening"
  - "Section ordering: imports // _hf hoisted // const q_ QRL decls // export body"
  - "Separator between _hf and QRL sections only added when both sections present"
  - "JSXElement children remain classified as dynamic (changing to static caused regressions)"
metrics:
  duration: 19min
  completed: "2026-04-11T15:48:00Z"
  tasks: 2
  files: 1
---

# Phase 16 Plan 01: Segment Body .w() Capture Wiring Summary

Implemented .w() capture wiring for nested QRL variables in segment bodies and improved segment code section ordering for hoisted signal declarations.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Apply .w() capture wiring to nested QRL variables in segment bodies | 141063f | src/optimizer/segment-codegen.ts |
| 2 | Component-scope .w() hoisting and section ordering fix | c561e3d | src/optimizer/segment-codegen.ts |

## What Changed

### Task 1: .w() Capture Wiring
- Bare `$()` calls in segment bodies now emit `.w([captures])` when the nested extraction has capture variables
- Previously: `const handleClick$ = q_Cmp_component_handleClick_WawHV3HwS1A`
- Now: `const handleClick$ = q_Cmp_component_handleClick_WawHV3HwS1A.w([toggleSig])`
- Named marker calls (e.g., `useTaskQrl(q_xxx.w([captures]))`) were already handled

### Task 2: Section Ordering and Component-Scope Hoisting
- Fixed segment code section ordering to match Rust optimizer: `[imports] // [_hf hoisted] // [const q_ QRL decls] // [export body]`
- Previously _hf declarations were placed after QRL declarations; now placed before with correct separators
- Added component-scope `.w()` hoisting: when captured variables come from the component scope (not loop parameters), the `.w()` declaration is injected before the return statement
- The `//` separator between _hf and QRL sections is only added when both sections are present

## Test Results

- **Convergence: 65/210 passing** (unchanged from baseline)
- **Unit tests: 462/465 passing** (3 pre-existing failures, zero regressions)

## Why Convergence Count Didn't Increase

The fixes are structurally correct and produce the expected output patterns. However, the convergence count didn't change because failing tests have **compound failures** -- multiple independent issues must all be fixed before a test flips from fail to pass.

Analysis of the 145 failing tests:
- **35 parent-only failures**: Segments match perfectly, but parent module has unused import removal or structural issues
- **76 segment-only failures**: Various issues including flags computation, q:p injection, prop classification, body-level prop destructuring
- **34 both fail**: Multiple issues in both parent and segment output

The .w() fix was confirmed working on specific snapshots (ternary_prop, should_extract_single_qrl_2) but those tests also have parent module issues preventing them from passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Section ordering for hoisted _hf declarations**
- **Found during:** Task 1 investigation
- **Issue:** _hf signal declarations were placed after QRL declarations instead of before
- **Fix:** Added classification logic to separate imports, _hf hoisted, QRL declarations, and other declarations with correct separator placement
- **Files modified:** src/optimizer/segment-codegen.ts

**2. [Rule 1 - Bug] Component-scope .w() hoisting position**
- **Found during:** Task 2
- **Issue:** Initial implementation injected .w() at function body opening (before variable declarations), causing reference-before-declaration errors
- **Fix:** Changed to inject before the return statement, after all const declarations
- **Files modified:** src/optimizer/segment-codegen.ts

### Attempted and Reverted

**JSXElement children classification**: Attempted classifying JSXElement children as 'static' instead of 'dynamic' to fix Fragment flags (1 vs 3). This caused 2 regressions and was reverted. The flags computation for nested JSX elements requires more nuanced analysis.

## Deferred Items

- Body-level prop destructuring to _wrapProp conversion (3 tests: destructure_args_colon_props, destructure_args_colon_props2, example_strip_server_code)
- Missing _fnSignal for deep store access patterns in segment bodies (6 tests)  
- JSXElement flags computation when JSX elements are children of Fragments
- Parent module unused import removal (affects 6+ parent-only failures)
- q:p/q:ps injection in segment body JSX (affects many event handler tests)

## Self-Check: PASSED
