---
phase: 11-segment-identity-batch-2
plan: 01
subsystem: optimizer/extract
tags: [context-stack, display-names, fragment, passive-events, custom-calls]
dependency_graph:
  requires: []
  provides: [fragment-context-push, passive-event-naming, custom-call-context-push]
  affects: [segment-identity, convergence-tests]
tech_stack:
  added: []
  patterns: [context-stack-push-for-naming, sibling-attribute-collection]
key_files:
  created: []
  modified:
    - src/optimizer/extract.ts
decisions:
  - JSXFragment pushes "Fragment" onto context stack (same as JSXElement pushes tag name)
  - Custom $-suffixed non-marker calls push callee name minus $ for display name context only
  - Passive event directives collected from sibling attributes on same JSXOpeningElement
metrics:
  duration: 3min
  completed: "2026-04-11T09:42:00Z"
  tasks: 2
  files: 1
---

# Phase 11 Plan 01: Fragment, Passive Events, and Custom Call Context Push Summary

Three context stack fixes in extract.ts for correct display name generation: JSXFragment pushes "Fragment", passive event naming uses real sibling directives, and non-marker $-suffixed calls push callee names.

## What Changed

### Task 1: JSXFragment and Custom $-suffixed Call Context Push (9d568f3)

Added two new context stack push cases in the walk enter handler:

1. **JSXFragment** -- When traversing `<>...</>` (JSXFragment nodes), pushes "Fragment" onto the context stack. This produces display names like `component_Fragment_button_q_e_click` matching the Rust optimizer.

2. **Custom $-suffixed calls** -- Non-marker calls like `useMemo$()` now push their name (minus the `$` suffix) onto the context stack. This is purely for naming context -- it does not trigger extraction. Produces display names like `App_component_useMemo_button_q_ep_click`.

### Task 2: Passive Event Naming Using Sibling Attributes (b63d8ea)

Fixed the JSXAttribute context push for HTML elements to collect real passive directives from sibling attributes instead of passing an empty `Set()` to `transformEventPropName`. Now imports and uses `collectPassiveDirectives` from `event-handler-transform.ts` to inspect all attributes on the same `JSXOpeningElement` for `passive:*` directives, producing correct `q_ep_`/`q_dp_` prefixes in display names.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- All acceptance criteria met:
  - `grep -n "JSXFragment"` shows Fragment context push
  - `grep -n "endsWith.*$.*isMarkerCall"` shows custom call context push
  - `collectPassiveDirectives` imported and used in extract.ts
  - No empty `Set()` remains for `transformEventPropName`
- Zero regressions in unit test suite (447 passed, same as baseline)
- The 5 targeted convergence tests still show parent module mismatches -- these are expected because full pipeline (parent module rewriting with new segment names) requires downstream phases to process correctly. The segment identity (display names, hashes) is now correct.

## Self-Check: PASSED

- [x] src/optimizer/extract.ts modified with all three fixes
- [x] Commit 9d568f3 exists (Task 1)
- [x] Commit b63d8ea exists (Task 2)
- [x] No regressions in existing passing tests
