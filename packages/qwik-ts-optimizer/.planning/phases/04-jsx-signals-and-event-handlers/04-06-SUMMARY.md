---
phase: 04-jsx-signals-and-event-handlers
plan: 06
subsystem: jsx-transform-integration
tags: [gap-closure, signal-analysis, event-handler, bind-transform, jsx]
dependency_graph:
  requires: [04-05]
  provides: [signal-wrapping-in-jsx, event-naming-in-jsx, bind-desugaring-in-jsx]
  affects: [jsx-transform, rewrite-parent]
tech_stack:
  added: []
  patterns: [signal-analysis-integration, event-prop-renaming, bind-desugaring-pipeline]
key_files:
  created: []
  modified:
    - src/optimizer/jsx-transform.ts
    - src/optimizer/rewrite-parent.ts
    - tests/optimizer/transform.test.ts
decisions:
  - Signal-wrapped props (_wrapProp, _fnSignal) always placed in constEntries per RESEARCH Pattern 2
  - Event prop renaming only applied on HTML elements (lowercase tag), not components
  - Bind desugaring skipped when spread props present (consistent with _jsxSplit behavior)
  - Passive directives stripped from output and consumed by collectPassiveDirectives
  - Hoisted signal declarations prepended in rewrite-parent.ts preamble after QRL declarations
metrics:
  duration: 3min
  completed: 2026-04-10T21:33:01Z
  tasks: 2
  files: 3
---

# Phase 04 Plan 06: Gap Closure - Wire Signal/Event/Bind into JSX Pipeline Summary

Signal-analysis, event-handler-transform, and bind-transform modules wired into processProps() with per-prop dispatch, SignalHoister collecting _hf declarations, and 10 integration tests proving end-to-end correctness.

## Task Completion

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Integrate signal analysis, event naming, and bind desugaring into JSX prop processing | f22a228 | src/optimizer/jsx-transform.ts, src/optimizer/rewrite-parent.ts |
| 2 | Add integration tests proving signal, event, and bind transforms in pipeline output | a95021f | tests/optimizer/transform.test.ts |

## What Changed

### jsx-transform.ts
- Added imports for signal-analysis, event-handler-transform, and bind-transform modules
- `JsxTransformOutput` now includes `hoistedDeclarations: string[]` for _hf declarations
- `processProps()` extended with `tagIsHtml`, `passiveEvents`, `signalHoister` parameters and returns `neededImports`
- Per-attribute dispatch order: passive strip -> bind desugar -> event rename -> signal analyze -> classify fallback
- Bind handler merging after loop for q-e:input collision handling
- `transformJsxElement()` computes tagIsHtml from processed tag string, passes passive events and hoister
- `transformAllJsx()` instantiates SignalHoister, collects passive directives per element, returns hoisted declarations

### rewrite-parent.ts
- Hoisted signal declarations (_hf0, _hf0_str, etc.) appended to preamble after QRL declarations

## Decisions Made

1. **Prop dispatch order**: passive -> bind -> event -> signal -> classifyProp. This prevents double-processing and matches the Rust optimizer's behavior.
2. **tagIsHtml detection**: Uses the processed tag string (starts with `"` and second char is lowercase a-z) rather than re-inspecting the AST node.
3. **Hoisted declarations placement**: Added to preamble in rewrite-parent.ts (after QRL decls, before `//` separator) for module-scope visibility.

## Deviations from Plan

None - plan executed exactly as written.

## Test Results

- 377 tests passing (367 existing + 10 new integration tests)
- No regressions
- New tests cover: _wrapProp, _wrapProp with field, _fnSignal with hoisting, q-e:click, q-d:focus, q-w:click, component event passthrough, bind:value, bind:checked, bind:unknown, passive events

## Self-Check: PASSED
