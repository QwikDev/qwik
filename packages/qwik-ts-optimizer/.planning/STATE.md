---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: verifying
stopped_at: Completed 05-03-PLAN.md
last_updated: "2026-04-10T22:24:04.321Z"
last_activity: 2026-04-10
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 21
  completed_plans: 21
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** Runtime-identical output to SWC optimizer -- same segments, captures, hashes, QRL structure
**Current focus:** Phase 05 — Entry Strategies and Build Modes

## Current Position

Phase: 05 (Entry Strategies and Build Modes) — EXECUTING
Plan: 3 of 3
Status: Phase complete — ready for verification
Last activity: 2026-04-10

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 18
- Average duration: --
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | - | - |
| 02 | 5 | - | - |
| 03 | 3 | - | - |
| 04 | 7 | - | - |

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

Last session: 2026-04-10T22:24:04.319Z
Stopped at: Completed 05-03-PLAN.md
Resume file: None
