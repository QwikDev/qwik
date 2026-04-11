# Phase 16: Final Convergence - Research

**Researched:** 2026-04-10
**Domain:** Qwik optimizer snapshot convergence -- closing 145 remaining failures to reach 209/209 (or 208/208 excluding no-input relative_paths)
**Confidence:** HIGH

## Summary

The optimizer currently passes 65/210 convergence tests (including 1 no-input skip). There are 145 failing tests spanning 177 snapshots with issues: 39 parent-only failures, 97 segment-only failures, and 41 combined parent+segment failures. Across all failures, segment code mismatches dominate (207 code mismatches), with only 9 missing segments and 14 metadata mismatches.

Detailed failure analysis reveals ~12 distinct recurring bug patterns. The vast majority of failures are concentrated in a few systemic issues: (1) segment body `.w()` capture wiring not applied, (2) `_wrapProp`/`_fnSignal` signal wrapping incomplete in segment bodies, (3) user imports leaking into parent output instead of being stripped, (4) dead code elimination for `isServer`/`isBrowser` not implemented in segments, (5) dev mode `qrlDEV()` format not emitted, and (6) import ordering/content differences in both parent and segment output. Fixing these 6-8 core patterns should resolve the majority of the 145 failures in a cascade effect.

**Primary recommendation:** Triage the 145 failures by root cause pattern (not by snapshot name), fix each pattern once in the core pipeline, and verify the cascade effect. Expect 3-5 plan waves, each fixing 1-2 patterns and unlocking 20-40+ snapshots.

## Project Constraints (from CLAUDE.md)

- **API compatibility**: Must be a drop-in replacement for the NAPI module -- same function signature, same output shape
- **Hash stability**: Must use the same hash algorithm as SWC optimizer so QRL references resolve correctly
- **Runtime correctness**: Output must produce working Qwik apps -- hydration, lazy-loading, segment resolution all functional
- **No double codebase**: Single TS implementation, not a parallel system alongside SWC
- **Stack**: oxc-parser, oxc-transform, oxc-walker, magic-string, siphash, vitest [VERIFIED: CLAUDE.md]

## Current State Analysis

### Convergence Numbers

| Metric | Count | Notes |
|--------|-------|-------|
| Total snapshots | 210 | Including 1 no-input (relative_paths) |
| Passing | 65 | 31% pass rate |
| Failing | 145 | 69% remaining |
| Parent-only failures | 39 | Parent module wrong, segments OK |
| Segment-only failures | 97 | Parent OK, segment code/meta wrong |
| Both parent+segment | 41 | Both wrong |
| Missing segments | 9 | Segment not found by name |
| Segment code mismatches | 207 | Code differs from expected |
| Segment metadata mismatches | 14 | Name/hash/captures/etc wrong |

[VERIFIED: vitest convergence test run + custom analysis script, 2026-04-10]

### TypeScript Errors

`tsc --noEmit` reports 12 errors across 3 files:
- `segment-codegen.ts`: 3 errors (possibly-undefined, `findLastIndex` needs es2023 lib, implicit any)
- `transform.ts`: 7 errors (walker type mismatches, `assertions` vs `attributes` on ImportDeclaration, ModuleExportName type narrowing)
- `extract.test.ts`: 2 errors (missing `isComponentEvent` property in test fixtures)

[VERIFIED: tsc --noEmit run, 2026-04-10]

### Unit Test Failures

3 unit tests failing (462 passing):
- `rewrite-parent.test.ts`: bare `$()` replacement test
- `transform.test.ts`: 2 bind desugaring tests (BIND-01, BIND-02)

[VERIFIED: vitest run excluding convergence tests, 2026-04-10]

## Failure Pattern Taxonomy

Analysis of representative diffs from each failure category reveals these recurring root causes. Patterns are ordered by estimated blast radius (how many snapshots each fix would unlock).

### Pattern 1: Segment Body .w() Capture Wiring Missing (HIGH blast radius)

**Observed in:** ternary_prop, should_extract_single_qrl, moves_captures_when_possible, and many more
**What goes wrong:** Nested QRL variables in segment bodies are assigned the bare QRL reference (`const handleClick$ = q_xxx`) instead of the capture-wired form (`q_xxx.w([toggleSig])`).
**Expected:** `const handleClick$ = q_Cmp_component_handleClick_WawHV3HwS1A.w([toggleSig])`
**Actual:** `const handleClick$ = q_Cmp_component_handleClick_WawHV3HwS1A`
**Root cause:** The `.w()` capture wiring logic in segment-codegen.ts is not applying capture arrays to nested QRL call sites within segment bodies.
**Estimated fix scope:** 30-50 snapshots

### Pattern 2: _wrapProp / _fnSignal Not Applied in Segment Bodies (HIGH blast radius)

**Observed in:** destructure_args_colon_props (3 variants), should_extract_single_qrl, many component segments
**What goes wrong:** Props that should be wrapped with `_wrapProp(props, "bind:value")` are instead destructured and passed as bare values. Deep store access that should produce `_fnSignal(_hfN, [row], _hfN_str)` produces `_wrapProp(row.value.label)` instead.
**Expected:** `_wrapProp(props, "bind:value")` or `_fnSignal(_hf2, [row], _hf2_str)`
**Actual:** `const { "bind:value": bindValue } = props; ... bindValue` or `_wrapProp(row.value.label)`
**Root cause:** Signal/prop analysis in segment bodies is using a different (simpler) code path than the parent module JSX transform.
**Estimated fix scope:** 25-40 snapshots

### Pattern 3: User Imports Leaking Into Parent Output (MEDIUM blast radius)

**Observed in:** example_build_server, example_drop_side_effects, ternary_prop, and many parent-only failures
**What goes wrong:** Original user-level imports (e.g., `import { component$, $, useSignal } from '@qwik.dev/core'`) remain in the parent output instead of being replaced by the rewritten import set.
**Expected:** Only rewritten imports (with specific specifiers like `componentQrl`, `_noopQrl`, etc.)
**Actual:** Both original and rewritten imports present
**Root cause:** The import cleanup/replacement in rewrite-parent.ts is not fully stripping original user imports when the parent module is rewritten.
**Estimated fix scope:** 20-30 snapshots

### Pattern 4: Dead Code Elimination for isServer/isBrowser (MEDIUM blast radius)

**Observed in:** example_build_server, example_strip_client_code, example_strip_server_code
**What goes wrong:** Segment bodies retain `if (isServer) { ... }` / `if (isBrowser) { ... }` blocks and their guarded imports instead of being simplified based on `isServer` option.
**Expected:** Dead branches removed, guarded imports removed
**Actual:** All branches and imports kept
**Root cause:** The strip-ctx/dead-code elimination for build-time constants is not applied to segment bodies, or the `isServer` option is not threaded through to segment codegen.
**Estimated fix scope:** 5-10 snapshots (but critical for correctness)

### Pattern 5: Dev Mode qrlDEV() Format Not Emitted (MEDIUM blast radius)

**Observed in:** example_drop_side_effects, example_dev_mode_inlined, example_jsx_keyed_dev, example_noop_dev_mode, example_dev_mode
**What goes wrong:** Segments use `qrl()` instead of `qrlDEV()` with location metadata `{ file, lo, hi, displayName }`.
**Expected:** `qrlDEV(() => import(...), "name", { file: "...", lo: N, hi: N, displayName: "..." })`
**Actual:** `qrl(() => import(...), "name")`
**Root cause:** Dev mode flag (`mode: 'lib'` or explicit dev mode) is not switching the QRL import format in segment codegen.
**Estimated fix scope:** 10-20 snapshots

### Pattern 6: Event Handler Prop Argument Position (_jsxSorted args) (MEDIUM blast radius)

**Observed in:** should_convert_jsx_events, should_convert_passive_jsx_events
**What goes wrong:** `q-d:*` and `q-w:*` event props are placed in the wrong argument position of `_jsxSorted()`. The SWC optimizer puts them in the `constProps` (arg 3) alongside `q-e:*` events, but our optimizer puts `q-d:*` and `q-w:*` in arg 1 (mutableProps).
**Expected:** All event attrs (`q-e:*`, `q-d:*`, `q-w:*`) in constProps (arg 3)
**Actual:** `q-d:*` and `q-w:*` in mutableProps (arg 1)
**Root cause:** The JSX prop classification in jsx-transform.ts treats `q-d:*` and `q-w:*` differently from `q-e:*`.
**Estimated fix scope:** 10-15 snapshots

### Pattern 7: Segment Body Side-Effect Simplification (MEDIUM blast radius)

**Observed in:** example_10, example_exports
**What goes wrong:** Segment bodies retain variable declarations for side-effect-only statements. E.g., `const hola = ident1.no;` should become just `ident1.no;` when the binding is not used.
**Expected:** `ident1.no;` (expression statement)
**Actual:** `const hola = ident1.no;` (variable declaration preserved)
**Root cause:** The minify/simplify pass does not strip unused variable bindings from segment bodies.
**Estimated fix scope:** 5-10 snapshots

### Pattern 8: _auto_ Re-export and Segment Import Path Issues (LOWER blast radius)

**Observed in:** example_exports, should_not_auto_export_var_shadowed_* (4 variants)
**What goes wrong:** Segments import from `"./project/test"` instead of `"./test"`. Also, `_auto_` prefix handling for re-exported variables uses wrong import alias in segments.
**Expected:** `import { exp1 } from "./test"` with `export { exp1 as _auto_exp1 }` in parent
**Actual:** `import { _auto_exp1 as exp1 } from "./project/test"`
**Root cause:** Segment import source resolution uses a different path computation than expected. The `_auto_` export/import pairing logic has path normalization issues.
**Estimated fix scope:** 8-12 snapshots

### Pattern 9: Missing // Separator Comment in Segments (LOWER blast radius)

**Observed in:** should_preserve_non_ident_explicit_captures, example_drop_side_effects segments
**What goes wrong:** Segment bodies missing the `//` separator comment between imports and body code.
**Expected:** `import {...}; //; export const ...`
**Actual:** Import block directly followed by export
**Root cause:** The segment codegen `//` separator insertion has edge cases where it's skipped.
**Estimated fix scope:** Small cosmetic issue, but causes AST comparison failures for many segments

### Pattern 10: Extra Imports in Segments (Capture Vars Not Removed) (LOWER blast radius)

**Observed in:** should_preserve_non_ident_explicit_captures
**What goes wrong:** Segments have extra imports for variables that are captured (should be accessed via `_captures[N]`, not imported).
**Expected:** Only `_captures` import, captured vars accessed as `_captures[0]`, etc.
**Actual:** Both `_captures` import AND direct imports of captured variables
**Root cause:** The segment import re-collection step does not account for variables that have been replaced by `_captures[N]` references.
**Estimated fix scope:** 3-5 snapshots

### Pattern 11: QRL Declaration Ordering in Segments (LOWER blast radius)

**Observed in:** example_prod_node, should_convert_jsx_events (segments pass AST comparison with import normalization, but QRL variable declarations are in different order)
**What goes wrong:** QRL `const q_xxx = qrl(...)` declarations in segments are emitted in a different order than the Rust optimizer.
**AST comparison handles this?:** Partially -- if the only difference is declaration ordering within the same block, the AST comparison catches it. But if preamble vs body ordering differs, it fails.
**Estimated fix scope:** 5-10 snapshots

### Pattern 12: Flags Bitmask Edge Cases (LOWER blast radius)

**Observed in:** Various JSX segments, scattered
**What goes wrong:** Children flag value in `_jsxSorted(tag, mutable, const, children, FLAGS, key)` differs from expected.
**Root cause:** Edge cases in static/dynamic child classification.
**Estimated fix scope:** 3-5 snapshots

## Architecture Patterns

### Fix Strategy: Pattern-Based Cascade Approach

Rather than fixing snapshots one-by-one (145 individual fixes), fix the underlying patterns:

```
Pattern Fix 1 (capture wiring) -> unlocks ~40 snapshots
Pattern Fix 2 (signal wrapping) -> unlocks ~30 snapshots  
Pattern Fix 3 (import cleanup)  -> unlocks ~25 snapshots
Pattern Fix 4 (dev mode QRL)    -> unlocks ~15 snapshots
Pattern Fix 5 (event arg pos)   -> unlocks ~12 snapshots
Pattern Fix 6-12 (smaller)      -> unlocks remaining ~23 snapshots
```

Each plan should:
1. Fix one pattern in the core pipeline
2. Run full convergence suite
3. Count newly passing tests
4. Lock all passing tests (never regress)

### Recommended Plan Structure

```
Plan 1: Segment body .w() capture wiring + _wrapProp/_fnSignal in segments
Plan 2: Parent import cleanup + user import stripping
Plan 3: Dev mode qrlDEV + event prop arg position + dead code elimination
Plan 4: _auto_ paths + separator comments + remaining edge cases
Plan 5: tsc --noEmit cleanup + unit test fixes + final 209/209 gate
```

### Key Files to Modify

| File | Patterns Addressed |
|------|-------------------|
| `src/optimizer/segment-codegen.ts` | Patterns 1, 2, 7, 9, 10, 11 |
| `src/optimizer/rewrite-parent.ts` | Pattern 3 |
| `src/optimizer/jsx-transform.ts` | Patterns 2, 6, 12 |
| `src/optimizer/rewrite-calls.ts` | Patterns 1, 5 |
| `src/optimizer/strip-exports.ts` | Pattern 4 |
| `src/optimizer/variable-migration.ts` | Pattern 8 |
| `src/optimizer/transform.ts` | Pattern 5 (dev mode threading) |
| `src/optimizer/dev-mode.ts` | Pattern 5 |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AST comparison | Custom string differ | Existing `compareAst()` + `strip()` | Already handles position/raw stripping, ParenthesizedExpression unwrap |
| Import normalization | Sort by hand | Existing import normalization in ast-compare.ts | Already normalizes import ordering |
| Convergence tracking | Manual counting | Existing convergence.test.ts + convergence-breakdown.test.ts | Already categorizes pass/fail/parent/segment |

## Common Pitfalls

### Pitfall 1: Fixing Pattern X Regresses Pattern Y
**What goes wrong:** A fix for segment capture wiring breaks parent module output for unrelated snapshots.
**Why it happens:** The transform pipeline shares state (magic-string mutations, extraction results) across parent and segment codegen.
**How to avoid:** After each pattern fix, run the FULL convergence suite. Any regression from the locked 65 must be investigated immediately.
**Warning signs:** Pass count goes up for target snapshots but down for previously-passing ones.

### Pitfall 2: AST Comparison False Positives
**What goes wrong:** A snapshot appears to pass because AST comparison is too lenient (strips too much).
**Why it happens:** The AST comparison already strips positions, raw values, and parenthesized expressions. If it also accidentally strips semantically meaningful differences, tests pass incorrectly.
**How to avoid:** Spot-check newly passing snapshots by visually comparing expected vs actual output.
**Warning signs:** Sudden large jumps in pass count (50+ from a small change).

### Pitfall 3: Snapshot Options Mismatch
**What goes wrong:** A snapshot fails because it's being run with wrong options (wrong mode, wrong transpileJsx, etc.).
**Why it happens:** The snapshot-options.ts map was built by inference from Rust test.rs. Some entries may be wrong.
**How to avoid:** When a fix doesn't resolve a snapshot, check its options first.
**Warning signs:** The diff shows fundamentally different output shape (e.g., JSX preserved vs transpiled).

### Pitfall 4: One Pattern Fix Masks Another
**What goes wrong:** Fix pattern 1 makes output "closer" but still fails because pattern 2 is also present.
**Why it happens:** Many snapshots have multiple issues. A segment may need both `.w()` wiring AND correct `_fnSignal` wrapping.
**How to avoid:** Expect diminishing returns per plan. First plan fixes 40+, last plan fixes 5-10.
**Warning signs:** Convergence count plateaus despite fixing known patterns.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts (or package.json) |
| Quick run command | `npx vitest run tests/optimizer/convergence.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONV-01 | 209/209 snapshots pass convergence | integration | `npx vitest run tests/optimizer/convergence.test.ts` | Yes |
| CONV-02 | Zero unit test regressions | unit | `npx vitest run --exclude '**/convergence*' --exclude '**/snapshot-batch*' --exclude '**/failure-families*'` | Yes |
| CONV-03 | tsc --noEmit clean | type-check | `npx tsc --noEmit` | N/A (compiler) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/optimizer/convergence.test.ts` (full convergence suite, ~700ms)
- **Per wave merge:** `npx vitest run` (all tests) + `npx tsc --noEmit`
- **Phase gate:** 209/209 (or 208/208) convergence + 0 unit failures + 0 tsc errors

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements.

## Code Examples

### Checking convergence count quickly
```bash
npx vitest run tests/optimizer/convergence.test.ts 2>&1 | grep "Tests.*failed.*passed"
```

### Getting detailed failure breakdown
```bash
npx vitest run tests/optimizer/convergence-breakdown.test.ts --reporter=verbose 2>&1
```

### Debugging a specific snapshot
Edit `tests/optimizer/debug-diff.test.ts`, set `TARGET = 'snapshot_name'`, then:
```bash
npx vitest run tests/optimizer/debug-diff.test.ts --reporter=verbose
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fix snapshots individually | Fix patterns, cascade to snapshots | Phase 16 | 12 patterns cover 145 failures |
| Parent-first, then segments | Both simultaneously per pattern | Phase 16 | Many failures are both parent+segment |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pattern blast radius estimates (e.g., "~40 snapshots" for capture wiring) | Failure Pattern Taxonomy | Plans may need more/fewer waves. Low risk -- convergence count after each fix will show actual numbers. |
| A2 | 6-8 core patterns account for majority of 145 failures | Summary | If there are many unique one-off issues, the phase will need more plans. Medium risk. |
| A3 | Fixing Pattern 1 won't regress existing 65 passing tests | Architecture Patterns | If regression occurs, need careful investigation. Medium risk -- mitigated by running full suite after each change. |

## Open Questions

1. **How many one-off edge cases exist beyond the 12 patterns?**
   - What we know: Sample diffs show recurring patterns, but only ~30 snapshots were examined in detail
   - What's unclear: Whether the remaining ~115 unexamined failures fit the same patterns
   - Recommendation: After fixing the top 6 patterns, re-run analysis to categorize remaining failures

2. **Are there snapshot-options.ts misconfigurations causing false failures?**
   - What we know: Options were inferred from Rust test.rs, but some tests were not found in the downloaded file
   - What's unclear: Whether any option overrides are wrong
   - Recommendation: When a pattern fix doesn't resolve a specific snapshot, check its options entry

3. **Does the 1 no-input snapshot (relative_paths) need to be addressed?**
   - What we know: relative_paths has no INPUT section, so convergence test skips it
   - What's unclear: Whether 208/208 or 209/209 is the correct target
   - Recommendation: Treat 208/208 (excluding no-input) as the gate, note 209 includes no-input skip

## Environment Availability

Step 2.6: SKIPPED (no external dependencies -- this phase is purely code/config changes to the optimizer).

## Sources

### Primary (HIGH confidence)
- Convergence test run: 65/210 passing [VERIFIED: vitest run, 2026-04-10]
- Custom failure analysis script: 39 parent-only, 97 segment-only, 41 both [VERIFIED: vitest run, 2026-04-10]
- tsc --noEmit: 12 errors across 3 files [VERIFIED: tsc run, 2026-04-10]
- Unit tests: 3 failing, 462 passing [VERIFIED: vitest run, 2026-04-10]
- Sample diff analysis: 13 representative snapshots examined [VERIFIED: debug-diff test, 2026-04-10]

### Secondary (MEDIUM confidence)
- Pattern blast radius estimates [ASSUMED: based on sample analysis extrapolation]

## Metadata

**Confidence breakdown:**
- Current state analysis: HIGH - directly measured via test runs
- Failure pattern taxonomy: HIGH - verified via actual diff output from representative samples
- Blast radius estimates: MEDIUM - extrapolated from samples, actual numbers will vary
- Plan structure recommendation: MEDIUM - based on pattern analysis, may need adjustment

**Research date:** 2026-04-10
**Valid until:** 2026-04-17 (fast-moving -- failures will shift as fixes land)
