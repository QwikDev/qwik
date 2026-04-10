# Project Research Summary

**Project:** Qwik Optimizer (TypeScript)
**Domain:** JavaScript compiler/optimizer -- single-file segment extraction for lazy-loading
**Researched:** 2026-04-10
**Confidence:** HIGH

## Executive Summary

The Qwik Optimizer is a single-file compiler that extracts closures wrapped in `$()` marker functions into separate lazy-loadable "segments," rewrites the parent module to reference them via QRLs, and transforms JSX into optimized `_jsxSorted` calls with signal-aware prop classification. The recommended approach uses oxc-parser (native Rust NAPI bindings, ESTree output) for parsing, oxc-walker with ScopeTracker for scope-aware AST traversal, and magic-string for position-stable surgical text replacement. This stack avoids the full-AST-reprint approach that caused the prior Rust/SWC rewrite to fail. The architecture is a strict two-pass pipeline: Pass 1 (analysis) walks the AST to collect segment sites, compute captures, build the segment tree, and classify JSX props; Pass 2 (codegen) applies all mutations to a single MagicString instance using original-source positions.

The primary risk is the "whack-a-mole convergence trap" that killed the prior rewrite attempt -- fixing one snapshot breaks another due to coupled logic. The mitigation is a batch-of-10 snapshot locking strategy with CI gates, combined with implementing features as composable, independently testable passes rather than a monolithic transform. The second critical risk is hash instability: segment hashes must be byte-identical to the SWC optimizer (SipHash-1-3 with zero keys), and the hash INPUT (display name construction) has subtle rules that must be reverse-engineered from all 209 snapshots before any codegen begins.

The feature surface is large (~30+ distinct behaviors) but well-specified by 209 snapshot tests that serve as the ground-truth specification. The recommended build order follows the dependency graph bottom-up: foundational utilities (types, hashing, naming) first, then the analysis pipeline (parser, walker, analyzer), then codegen (parent rewrite, segment generation), and finally the complex JSX/signal/event-handler transforms last.

## Key Findings

### Recommended Stack

The stack is largely pre-decided and verified. All core dependencies are native-speed Rust bindings (oxc-parser, oxc-transform) or battle-tested JS libraries (magic-string, oxc-walker). The critical addition is the `siphash` npm package (by SipHash co-author jedisct1) for deterministic hash generation matching Rust's `DefaultHasher`.

**Core technologies:**
- **oxc-parser** (v0.124.0): Parse TS/TSX/JS/JSX to ESTree AST -- 100x faster than Babel, native NAPI
- **oxc-transform** (v0.121.0): Strip TypeScript syntax -- same oxc ecosystem, 40x faster than Babel
- **oxc-walker** (v0.6.0): AST traversal with ScopeTracker -- provides `getUndeclaredIdentifiersInFunction` for capture analysis
- **magic-string** (v0.30.21): Position-stable text replacement -- avoids full AST reprint, source map support when needed
- **siphash** (v1.1.0): SipHash-1-3 matching Rust DefaultHasher -- must use zero keys, raw byte concatenation, URL-safe base64 encoding
- **vitest** (v4.1.4): Test runner -- ESM-native, fast, built-in coverage
- **pathe** (v2.0.3): Cross-platform path normalization -- forward-slash normalization matching Rust's `to_slash_lossy()`

### Expected Features

**Must have (table stakes -- Qwik apps break without these):**
- Marker function detection (`$` suffix) and segment extraction
- Deterministic symbol naming and hashing (byte-identical to SWC)
- Capture analysis with `_captures` injection and `.w()` wrapping
- Parent module rewriting (`component$` -> `componentQrl`, etc.)
- JSX transform (`_jsxSorted` with varProps/constProps classification)
- Signal optimizations (`_wrapProp`, `_fnSignal`, hoisted `_hf` functions)
- Event handler transform (`onClick$` -> `q-e:click`, document/window scoping)
- Import path rewriting (`@builder.io/*` -> `@qwik.dev/*`)
- Entry strategies (smart, inline/hoist, component, single)
- Build modes (dev with `qrlDEV`, server/client strip, const replacement)
- Variable migration with `_auto_` re-exports
- Loop-context QRL hoisting with `q:p`/`q:ps` injection
- Diagnostics (C02, C03, C05)

**Should have (differentiators over SWC):**
- Pure TypeScript implementation (team can read/debug/modify without Rust)
- AST-based test comparison (more robust than string matching)
- Better error messages with richer diagnostic context

**Defer (v2+):**
- Source map generation (magic-string provides this when needed)
- Performance optimization (correctness first)

### Architecture Approach

A strict two-pass pipeline operating on a single MagicString instance. Pass 1 (analysis) is read-only: parse, strip TS, walk AST with ScopeTracker, compute captures, build segment tree, classify JSX. Pass 2 (codegen) is write-only: rewrite parent module via MagicString, generate each segment as a fresh string. The central data structure is `TransformContext`, built incrementally during Pass 1 and consumed read-only during Pass 2.

**Major components:**
1. **Parser** -- oxc-parser + oxc-transform wrapper, produces AST + JS source
2. **Walker** -- AST walk with ScopeTracker, collects segment sites and scope chain
3. **Analyzer** -- Capture analysis, segment tree construction, name/hash generation
4. **ParentCodegen** -- Rewrites parent module via MagicString (QRL refs, imports, call forms)
5. **SegmentCodegen** -- Generates each segment module (closure extraction, capture unpacking, imports)
6. **JSXTransform** -- Prop classification, signal wrapping, event handler extraction (used by both codegens)
7. **Diagnostics** -- Warning/error collection across all stages

### Critical Pitfalls

1. **Scope boundary misclassification** -- `var` hoisting, destructured params, and loop variables create subtle capture bugs. Use oxc-walker's ScopeTracker exclusively; write targeted scope edge-case unit tests before snapshot matching.
2. **Hash instability from wrong display names** -- Even with the correct SipHash algorithm, wrong display name input means wrong hashes and ALL snapshots fail. Reverse-engineer display names from all 209 snapshots first; validate naming against metadata before writing any codegen.
3. **Whack-a-mole convergence trap** -- Fixing snapshot N breaks snapshot M due to coupled logic. Lock batches with CI gates; order batches by feature isolation; implement features as composable passes.
4. **Event handler name mapping complexity** -- 7+ distinct patterns (`onClick$`, `onDocumentScroll$`, `on-cLick$`, `host:onClick$`, etc.) with non-obvious rules. Extract all patterns from snapshots into a lookup table; test exhaustively.
5. **magic-string edit ordering for nested segments** -- Inner replacements must happen before outer ones. Always process innermost `$()` first; never edit overlapping ranges.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 0: Test Infrastructure and Utilities
**Rationale:** The prior rewrite failed due to string-based snapshot comparison. AST comparison must be solid before any implementation begins. Hashing and naming are the highest-leverage correctness requirements.
**Delivers:** AST comparison utility, snapshot loading/parsing, hash function (verified against all 209 snapshots), display name construction (verified against all 209 snapshot metadata), project scaffolding (tsconfig, vitest config, package.json).
**Addresses:** Test infrastructure, deterministic symbol naming, hashing
**Avoids:** Pitfall 3 (whack-a-mole -- broken tests hide real bugs), Pitfall 8 (AST comparison false positives), Pitfall 2 (hash instability)

### Phase 1: Core Extraction Pipeline
**Rationale:** Segment extraction is the foundation everything else builds on. Must handle nested `$()` correctly from the start.
**Delivers:** Parser wrapper, AST walker with segment site collection, segment tree construction, basic parent module rewriting (`$()` -> `qrl()` references), segment module generation (no captures yet).
**Addresses:** Marker function detection, segment extraction, parent module rewriting, call form rewriting
**Avoids:** Pitfall 7 (magic-string edit ordering -- test with nested `$()` early)

### Phase 2: Capture Analysis and Variable Handling
**Rationale:** Captures are the core correctness requirement after extraction. Wrong captures mean runtime crashes that are nearly impossible to debug.
**Delivers:** Capture analysis via ScopeTracker, `_captures` injection in segments, `.w()` wrapping in parent, variable migration with `_auto_` re-exports, import generation for segments.
**Addresses:** Scoped identifier detection, `_captures` array injection, `.w()` capture wrapping, variable migration, import handling
**Avoids:** Pitfall 1 (scope boundary misclassification -- dedicated edge-case tests first)

### Phase 3: JSX Transforms
**Rationale:** JSX is the largest and most complex feature surface. It depends on scope analysis (for signal detection) and extraction (for segment generation) being solid.
**Delivers:** `_jsxSorted` generation, varProps/constProps classification, `_wrapProp` and `_fnSignal` signal wrapping, hoisted `_hf` helper functions, event handler extraction and naming, `q:p`/`q:ps` injection, flags bitmask, key generation.
**Addresses:** All JSX transform features, signal optimizations, event handler transforms, bind syntax
**Avoids:** Pitfall 4 (event handler naming -- build lookup table from snapshots), Pitfall 6 (signal classification -- build as pure function)

### Phase 4: Entry Strategies and Build Modes
**Rationale:** These are configuration variants of the core pipeline. They layer on top of working extraction + captures + JSX.
**Delivers:** Inline/hoist entry strategy (`_noopQrl` + `.s()`), component grouping, dev mode (`qrlDEV`, `_useHmr`, JSX source info), server/client strip, const replacement (`isServer`, `isBrowser`, `isDev`), strip exports mode.
**Addresses:** Entry strategies, build modes, `sync$` serialization
**Avoids:** Pitfall 3 (whack-a-mole -- entry strategies should be isolated configuration, not coupled to core logic)

### Phase 5: Diagnostics and Edge Cases
**Rationale:** Diagnostics and remaining edge cases. These are important for developer experience but do not affect runtime correctness of generated code.
**Delivers:** C02/C03/C05 diagnostics, `@qwik-disable-next-line` support, loop-context QRL hoisting refinement, default export handling, Windows path normalization, `tagName` option, preserve filenames option.
**Addresses:** All diagnostic features, remaining miscellaneous features
**Avoids:** Pitfall 10 (hoisted QRL patterns in loops -- requires both captures and JSX working)

### Phase Ordering Rationale

- **Bottom-up dependency order:** Types/hashing/naming (Phase 0) -> extraction (Phase 1) -> captures (Phase 2) -> JSX (Phase 3) -> modes (Phase 4) -> edge cases (Phase 5). Each phase depends only on prior phases.
- **Feature isolation per batch:** Each phase covers a distinct feature category. Batches of 10 snapshots should be selected from within a single phase's feature scope to avoid cross-cutting regressions.
- **Risk-first ordering:** The two highest-risk items (hash/naming correctness and scope/capture analysis) are addressed in Phases 0-2 before the high-complexity JSX work begins.
- **Convergence protection:** Phases are designed so that a fix in Phase N should never affect Phase N-1's locked snapshots, because each phase's features are architecturally isolated as separate composable passes.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 0 (hashing):** The SipHash-1-3 byte-feeding semantics (no length prefix, no separators) need verification against the `siphash` npm package's API. Validate with known hash pairs from snapshots.
- **Phase 3 (JSX):** Signal classification rules (when to use `_wrapProp` vs `_fnSignal` vs varProps) are complex and only partially documented. The `example_derived_signals_cmp` snapshot is the key reference.
- **Phase 3 (events):** Event handler naming has 7+ patterns. Need exhaustive pattern extraction from all 209 snapshots.
- **Phase 4 (inline/hoist):** The `_noopQrl` + `.s()` pattern for inlined entry strategy needs careful study from the inline-specific snapshots.

Phases with standard patterns (skip research-phase):
- **Phase 1 (extraction):** Well-documented two-pass architecture with clear component boundaries.
- **Phase 2 (captures):** oxc-walker's ScopeTracker API is well-documented; `getUndeclaredIdentifiersInFunction` does the heavy lifting.
- **Phase 5 (diagnostics):** Straightforward pattern matching and error emission.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core technologies pre-decided and verified on npm. siphash algorithm verified from Qwik Rust source. |
| Features | HIGH | 209 snapshot tests serve as exhaustive specification. Feature surface fully enumerated. |
| Architecture | HIGH | Two-pass pipeline with magic-string is well-reasoned. Anti-patterns from prior failure clearly identified. |
| Pitfalls | HIGH | Prior Rust rewrite failure provides direct evidence of what goes wrong. Mitigations are concrete and actionable. |

**Overall confidence:** HIGH

### Gaps to Address

- **siphash npm API verification:** The `siphash` package's SipHash-1-3 variant needs testing to confirm it accepts raw byte arrays and produces results matching Rust's DefaultHasher. If the API doesn't support streaming byte writes, may need to pre-concatenate bytes before hashing.
- **oxc-transform position stability:** Need to verify that oxc-transform's TS stripping produces a JS string whose character positions are usable by magic-string without a position remapping layer. If positions shift, the MagicString must be initialized on the stripped output (not the original TS).
- **Display name construction completeness:** The display name rules are inferred from snapshots. There may be edge cases not covered by the 209 test files (e.g., deeply nested re-exports, computed property names as component names). These would surface during implementation.
- **oxc-walker freeze() semantics:** Need to confirm that `ScopeTracker.freeze()` is called automatically after `walk()` completes or if it requires manual invocation. The capture query API depends on frozen state.

## Sources

### Primary (HIGH confidence)
- 209 snapshot test files in `match-these-snaps/` -- exhaustive behavioral specification
- Qwik optimizer Rust source (`transform.rs`) -- hash algorithm, display name construction
- oxc-parser, oxc-transform, oxc-walker npm packages -- API documentation and version verification
- magic-string GitHub -- position-stable editing API

### Secondary (MEDIUM confidence)
- [Qwik Optimizer Rules](https://qwik.dev/docs/advanced/optimizer/) -- official docs on optimizer constraints
- [Qwik Optimizer Brainstorm](https://hackmd.io/@qwik/HJVXmRaBK) -- original design document
- [siphash-js GitHub](https://github.com/jedisct1/siphash-js) -- SipHash-1-3 variant availability

### Tertiary (LOW confidence)
- [magic-string state corruption issue #115](https://github.com/Rich-Harris/magic-string/issues/115) -- known bug to watch for in nested edits
- [compare-ast](https://github.com/jugglinmike/compare-ast) -- pattern reference for AST comparison approach

---
*Research completed: 2026-04-10*
*Ready for roadmap: yes*
