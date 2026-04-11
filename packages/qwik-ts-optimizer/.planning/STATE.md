---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: milestone
status: executing
stopped_at: Completed 15-01-PLAN.md
last_updated: "2026-04-11T14:37:00.676Z"
last_activity: 2026-04-11
progress:
  total_phases: 10
  completed_phases: 8
  total_plans: 31
  completed_plans: 29
  percent: 94
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** Runtime-identical output to SWC optimizer -- same segments, captures, hashes, QRL structure
**Current focus:** Phase 15 — Segment Codegen Batch 3

## Current Position

Phase: 15 (Segment Codegen Batch 3) — EXECUTING
Plan: 2 of 3
Status: Ready to execute
Last activity: 2026-04-11

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 49
- Average duration: --
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 5 | - | - |
| 03 | 3 | - | - |
| 04 | 7 | - | - |
| 05 | 3 | - | - |
| 07 | 5 | - | - |
| 08 | 5 | - | - |
| 09 | 3 | - | - |
| 10 | 3 | - | - |
| 11 | 3 | - | - |
| 12 | 3 | - | - |
| 13 | 3 | - | - |
| 14 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: --
- Trend: --

*Updated after each plan completion*
| Phase 01 P01 | 4min | 2 tasks | 6 files |
| Phase 01 P02 | 7min | 2 tasks | 5 files |
| Phase 01 P03 | 3min | 3 tasks | 6 files |
| Phase 02 P01 | 3min | 2 tasks | 6 files |
| Phase 02 P02 | 3min | 2 tasks | 4 files |
| Phase 02 P03 | 4min | 2 tasks | 5 files |
| Phase 02 P04 | 3min | 1 tasks | 2 files |
| Phase 02 P05 | 7min | 2 tasks | 6 files |
| Phase 03 P01 | 2min | 1 tasks | 2 files |
| Phase 03 P02 | 2min | 1 tasks | 2 files |
| Phase 03 P03 | 6min | 2 tasks | 5 files |
| Phase 04 P01 | 5min | 2 tasks | 2 files |
| Phase 04 P02 | 5min | 2 tasks | 2 files |
| Phase 04 P03 | 7min | 2 tasks | 4 files |
| Phase 04 P04 | 3min | 2 tasks | 2 files |
| Phase 04 P05 | 8min | 2 tasks | 9 files |
| Phase 04 P06 | 3min | 2 tasks | 3 files |
| Phase 04 P07 | 5min | 2 tasks | 2 files |
| Phase 05 P01 | 4min | 2 tasks | 8 files |
| Phase 05 P02 | 4min | 2 tasks | 6 files |
| Phase 05 P03 | 4min | 2 tasks | 6 files |
| Phase 06 P01 | 9min | 2 tasks | 5 files |
| Phase 06 P02 | 13min | 2 tasks | 5 files |
| Phase 06 P03 | 22min | 2 tasks | 5 files |
| Phase 07 P01 | 11min | 1 tasks | 1 files |
| Phase 07 P02 | 12min | 1 tasks | 3 files |
| Phase 07 P03 | 19min | 2 tasks | 3 files |
| Phase 07 P04 | 14min | 1 tasks | 2 files |
| Phase 07 P05 | 22min | 2 tasks | 5 files |
| Phase 08 P01 | 3min | 2 tasks | 2 files |
| Phase 08 P02 | 13min | 2 tasks | 2 files |
| Phase 08 P03 | 16min | 2 tasks | 4 files |
| Phase 08 P04 | 13min | 1 tasks | 2 files |
| Phase 08 P05 | 21min | 2 tasks | 4 files |
| Phase 09 P01 | 6min | 2 tasks | 5 files |
| Phase 09 P02 | 11min | 1 tasks | 2 files |
| Phase 09 P03 | 20min | 2 tasks | 6 files |
| Phase 10 P01 | 5min | 2 tasks | 2 files |
| Phase 10 P02 | 25min | 1 tasks | 3 files |
| Phase 10 P03 | 6min | 2 tasks | 1 files |
| Phase 11 P01 | 3min | 2 tasks | 1 files |
| Phase 11 P02 | 13min | 2 tasks | 2 files |
| Phase 11 P03 | 18min | 2 tasks | 1 files |
| Phase 12 P01 | 11min | 2 tasks | 2 files |
| Phase 12 P02 | 21min | 2 tasks | 7 files |
| Phase 12 P03 | 43min | 2 tasks | 5 files |
| Phase 13 P01 | 2min | 2 tasks | 3 files |
| Phase 13 P02 | 3min | 2 tasks | 2 files |
| Phase 13 P03 | 23min | 2 tasks | 5 files |
| Phase 14 P01 | 9min | 2 tasks | 2 files |
| Phase 14 P02 | 12min | 2 tasks | 3 files |
| Phase 14 P03 | 26min | 2 tasks | 3 files |
| Phase 15 P01 | 10min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Hash verification must come FIRST -- if hashes don't match, nothing else can be validated
- [Roadmap]: Batch testing (10 snapshots at a time, lock, never regress) is the convergence strategy
- [Roadmap]: JSX/signals/events grouped into single phase since they are tightly coupled
- [Phase 01]: Segment vs parent module distinguished by metadata JSON presence, not ENTRY POINT marker
- [Phase 01]: SipHash-1-3 with zero keys confirmed byte-identical to Rust DefaultHasher for 389/401 corpus hashes; 7 edge cases deferred to optimizer phases
- [Phase 01]: AST comparison strips start/end/loc/range for whitespace-insensitive semantic equivalence
- [Phase 02]: Sort import rewrite rules by descending from-length to prevent false prefix matches (qwik-city before qwik)
- [Phase 02]: SegmentMetadataInternal extends SegmentAnalysis with optional paramNames/captureNames for snapshot compat (keeps public API clean)
- [Phase 02]: ContextStack is a passive data structure (push/pop) not an AST walker; walker integration deferred to Plan 03
- [Phase 02]: Marker detection uses two-map approach: qwik core imports map + custom inlined map for full coverage
- [Phase 02]: Context stack pushes callee name for marker calls to produce correct display names (e.g., App_component)
- [Phase 02]: Only top-level extractions have call sites rewritten in parent; nested calls handled in segment bodies
- [Phase 02]: Nesting detected by range containment: inner callStart >= outer argStart && inner callEnd <= outer argEnd
- [Phase 02]: canonicalFilename includes file stem prefix (displayName + hash), matching Rust optimizer behavior
- [Phase 02]: Only top-level extractions get QRL declarations/imports in parent; nested ones go in their parent segment
- [Phase 02]: QWIK_CORE_PREFIXES expanded to all Qwik packages (core, react, router) in both old and new naming
- [Phase 03]: Used oxc-walker getUndeclaredIdentifiersInFunction() for scope-aware capture detection rather than hand-rolling scope analysis
- [Phase 03]: Conservative side-effect detection: whitelist of safe node types (literals, arrow/function expressions, pure object/array literals)
- [Phase 03]: Nested captures use parent extraction body scope, not module scope, for parentScopeIdentifiers
- [Phase 03]: Top-level segments have migrated variable names filtered from captureNames to prevent double-handling via _captures and _auto_
- [Phase 04]: Flags bitmask: bit0=immutable props, bit1=static children, bit2=loop context (verified against snapshot corpus)
- [Phase 04]: JSX transform built as single module with tightly-coupled spread/fragment/tag functions
- [Phase 04]: Deep store access (depth >= 2) produces _fnSignal not _wrapProp; single-level produces _wrapProp(obj, field)
- [Phase 04]: Event naming algorithm matched exactly to Rust normalize_jsx_event_name + create_event_name (dashes become double-dashes)
- [Phase 04]: Bind desugaring returns string code for inlinedQrl calls (magic-string codegen approach)
- [Phase 04]: Loop hoisting produces plan objects (not mutations) for pipeline consumption in Plan 05
- [Phase 04]: Skip ranges approach for magic-string: extraction argument ranges passed as skip ranges to JSX transform to avoid conflicts with already-rewritten regions
- [Phase 04]: Signal/event/bind gap closure: processProps dispatch order is passive->bind->event->signal->classify; hoisted _hf declarations placed in preamble after QRL decls
- [Phase 04]: Loop context tracked via loopStack in walk enter/leave; q:p/q:ps injected into constEntries for HTML elements inside loops
- [Phase 05]: Entry strategy resolution is a pure function; dev mode uses parameter threading not global config
- [Phase 05]: Pre-compute QRL variable names before call site rewriting so stripped segments use sentinel names in both declarations and call sites
- [Phase 05]: Const replacement applied after import rewriting, before nesting; DCE intentionally skipped (bundler handles it)
- [Phase 06]: Diagnostic type updated to snapshot format: category (not severity), scope, suggestions, flat highlights
- [Phase 06]: C02 detection independent of captureNames -- uses getUndeclaredIdentifiersInFunction per extraction body
- [Phase 06]: Rust EmitMode::Test maps to TS 'lib' mode; import cleanup done as post-processing re-parse step; options for 100+ snapshots inferred from output patterns
- [Phase 06]: All $-suffixed JSX attribute extractions use ctxKind eventHandler (matching Rust optimizer)
- [Phase 06]: ParenthesizedExpression unwrapped in AST comparison for semantic equivalence
- [Phase 06]: transpileJsx option gates JSX transformation; Rust test default is transpileJsx=false
- [Phase 07]: removeUnusedImports left unchanged -- Qwik import preservation varies across Rust snapshots; blanket preservation causes regressions
- [Phase 07]: Import order normalization added to AST comparison -- import ordering has no semantic meaning in JS/TS, so both sides normalized before comparison
- [Phase 07]: transformSCallBody pattern: nested extractions get .s() calls before their parent, body text rewritten with descending-position replacement to avoid offset issues
- [Phase 07]: Unused binding removal: only strip when extraction is nested inside init (not when init IS extraction); Qwik import preservation uses quote-style + non-$-specifier heuristic; skip migration for inline strategy
- [Phase 07]: Body JSX transpilation uses wrap-parse-transform-unwrap pattern; child JSX elements get null keys matching Rust optimizer; QRL var names treated as const in body context
- [Phase 07]: Hoist body inserted via magic-string at containing statement position, not in preamble; oxc-transform strips TS types from hoist body; JSX child elements classified as dynamic; component-aware null-key assignment
- [Phase 08]: Filter reexport migration decisions for capture suppression; TS stripping is absolute final step after all magic-string ops
- [Phase 08]: No-extraction passthrough gated on !needsJsxTransform; hoist-to-const triggered by transpileTs && transpileJsx on inline strategy
- [Phase 08]: _rawProps transform applied to all extractions with ObjectPattern params; collectAllDeps partitions reactive roots first then bare identifiers for correct pN ordering
- [Phase 08]: regCtxName matching uses exact callee name comparison; const capture inlining parses parent body for literal values; regCtxName extractions skip _captures injection
- [Phase 08]: JSXElement context push: tag name pushed on JSXElement (not JSXOpeningElement) so children inherit context for display names
- [Phase 08]: oxc-transform jsx:'preserve' strips TS types without transpiling JSX when transpileJsx=false
- [Phase 08]: Component elements (uppercase tag) keep untransformed event names in display path; HTML elements use transformed q_e_click format
- [Phase 09]: isMarkerCall checks importedName.endsWith('$') instead of isQwikCore -- any $-suffixed import is a marker regardless of source package
- [Phase 09]: isCustomInlined returns false when callee is found in imports -- imported bindings are not custom inlined regardless of package source
- [Phase 09]: repairInput only activates when parseSync returns empty body with errors -- well-formed inputs pass through unchanged
- [Phase 09]: JSX text containing > wrapped as string expression containers to match SWC output behavior
- [Phase 09]: inlinedQrl symbol name from arg[1] determines hash; captures explicit not scope-based; qrlDEV for lib mode local files
- [Phase 10]: Disambiguation as post-processing on ExtractionResult array, counter scoped per-file matching Rust per-QwikTransform
- [Phase 10]: Prod mode s_ naming inserted after disambiguation but before rewriteParentModule so parent QRL refs use s_ names
- [Phase 10]: Unit tests updated to explicitly set mode: 'lib' matching Rust test harness EmitMode::Test default
- [Phase 10]: markerCallDepth counter tracks nesting depth inside marker calls; JSX attr extraction only fires when depth > 0
- [Phase 10]: Non-Qwik @jsxImportSource pragma suppresses all JSX attribute extraction regardless of marker depth
- [Phase 11]: JSXFragment pushes Fragment onto context stack; custom non-marker $-suffixed calls push callee name for display names; passive event naming uses real sibling directives
- [Phase 11]: Captures reconciliation checks allCapturesInParams at two pipeline points; capture-to-param promotion deferred pending loop detection
- [Phase 11]: Extension downgrade (.tsx->.ts, .jsx->.js) applied early on extraction objects for consistent extensions across parent and segment output
- [Phase 11]: All 22 Phase 11 target failures classified as codegen issues (not identity); deferred to Phases 13-15
- [Phase 12]: Event handler captures from immediate parent scope become paramNames with _,_1 padding (not just loop contexts)
- [Phase 12]: Re-detect captures from intermediate scopes (e.g. .map() callbacks) via AST scope walking
- [Phase 12]: Loop-local vs cross-scope partition: only immediate loop iterVars and body declarations are loop-local
- [Phase 12]: q:p goes to varEntries matching Rust optimizer; _fnSignal children are dynamic; signal dedup uses function body text as key
- [Phase 12]: ParamNames use declaration position ordering, not alphabetical; shared slot allocation with trailing omission; q:p from capture analysis not iterVars
- [Phase 13]: applyRawPropsTransform applied BEFORE nested call rewriting in segment codegen; TS stripping uses same oxcTransformSync pattern as parent; dead code elimination uses simple regex for if(false)
- [Phase 13]: collectBodyIdentifiers uses full AST parse via oxc-parser/oxc-walker with regex fallback; import re-collection runs after ALL body transforms; sameFileExportNames includes exported AND top-level declared names
- [Phase 13]: JSX $-attr extraction gate removed: markerCallDepth > 0 no longer required, enabling event handler extraction from any JSX context
- [Phase 13]: removeUnusedImports runs unconditionally after dead code elimination for all segments; detects JSXIdentifier references
- [Phase 14]: Used getQrlImportSource from rewrite-calls.ts for consistent import source resolution across parent and segment codegen
- [Phase 14]: Bare $() calls still emit plain QRL variable; only named markers get calleeQrl wrapping
- [Phase 14]: Enum value inlining uses map-based replacement in segment bodies rather than full-file TS transpilation before extraction
- [Phase 14]: Already-exported variables skip _auto_ prefix in segment imports -- imported directly by original name
- [Phase 14]: Bind-desugared prop names always quoted; merge order follows JSX attribute order; paramNames signal exclusion reverted (deep prop access still needs _fnSignal)
- [Phase 15]: Unconditional segment JSX transpilation deferred -- Rust optimizer respects transpileJsx for segments; snapshot-options corrected instead
- [Phase 15]: Already-exported variables skip _auto_ prefix in parent re-export; segments import them directly by original name

### Pending Todos

None yet.

### Blockers/Concerns

- siphash npm package API needs verification against SipHash-1-3 variant with zero keys
- oxc-transform position stability needs verification (does TS stripping shift character positions?)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260410-ith | Switch from npm to pnpm, add hash tests, replace regex with magic-regexp | 2026-04-10 | c5655fd | [260410-ith-switch-from-npm-to-pnpm-add-hash-tests-r](./quick/260410-ith-switch-from-npm-to-pnpm-add-hash-tests-r/) |
| 260410-jbb | Convert remaining raw regex to magic-regexp in snapshot-parser.ts and siphash.test.ts | 2026-04-10 | b9a85ec | [260410-jbb-convert-remaining-raw-regex-to-magic-reg](./quick/260410-jbb-convert-remaining-raw-regex-to-magic-reg/) |

## Session Continuity

Last session: 2026-04-11T14:37:00.674Z
Stopped at: Completed 15-01-PLAN.md
Resume file: None
