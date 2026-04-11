# Convergence Analysis — April 11, 2026

## Current State: 76/210 (36.4%)

Breakdown of 134 failures:
- **Parent-only fail**: 36 tests (segments OK, parent bad)
- **Segment-only fail**: 68 tests (parent OK, segments bad)  
- **Both fail**: 30 tests

## Segment-Only Failures (68 tests, 89 code mismatches)

### Root Causes

1. **Props destructuring not transformed** (dominant pattern)
   - SWC's `props_destructuring.rs` converts `const { "bind:value": bindValue } = props` into `_wrapProp(props, "bind:value")`
   - Our code keeps destructuring as-is in segment bodies
   - Affects: `destructure_args_*`, `example_props_*`, `example_input_bind`

2. **Self-referential QRL pattern missing**
   - SWC generates `const _ref = {}; _ref.sig = useAsyncQrl(...)` for circular captures
   - Our code emits direct `const sig = useAsyncQrl(...)`
   - Affects: `component_level_self_referential_qrl`

3. **Missing _restProps / _fnSignal in destructured components**
   - SWC generates `_restProps(props, ["test"])` for rest patterns
   - Our code keeps `const { test, ...rest } = props`

4. **ctxKind mismatch** (3 segments)
   - Expected `jSXProp` but producing `eventHandler`

5. **captures boolean** (2 segments)
   - Mismatch on whether segment captures outer variables

### Metadata fields: all correct except ctxKind (3) and captures (2)

## Parent-Only Failures (36 tests)

1. **QRL declaration format** — non-exported `$()` bindings should be bare expressions, not const declarations
2. **Extra hoisted declarations** — `_hf*` declarations appearing where they shouldn't
3. **Extra auto-export statements**

## Impact of const_idents Work

- Infrastructure committed and working correctly
- `const state = useStore(...)` correctly routes `state` to constProps
- No convergence test flips because failures are structural (props destructuring, QRL format), not prop classification

## Next Steps (by impact)

1. **Props destructuring transform** — would fix ~30+ segment-only failures
2. **Non-exported QRL format** — would fix ~10+ parent-only failures  
3. **Self-referential QRL pattern** — niche but blocks a few tests
