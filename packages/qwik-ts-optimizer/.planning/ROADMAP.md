# Roadmap: Qwik Optimizer (TypeScript)

## Overview

This roadmap transforms the Qwik optimizer from Rust/SWC to TypeScript, building bottom-up from test infrastructure and hash verification through extraction, capture analysis, JSX transforms, and build modes. Each phase delivers a verifiable capability that subsequent phases build on. The batch-of-10 snapshot locking strategy prevents the whack-a-mole convergence trap that killed the prior Rust rewrite.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Test Infrastructure and Hash Verification** - Snapshot parser, AST comparison, SipHash-1-3, display name construction
- [ ] **Phase 2: Core Extraction Pipeline** - Segment extraction, call form rewriting, import handling, public API shell
- [ ] **Phase 3: Capture Analysis and Variable Migration** - Scope-aware capture detection, captures injection, variable migration
- [ ] **Phase 4: JSX, Signals, and Event Handlers** - JSX transform, signal optimizations, event handlers, bind syntax, loop hoisting
- [ ] **Phase 5: Entry Strategies and Build Modes** - Smart/inline/component strategies, dev/prod modes, strip modes, const replacement
- [ ] **Phase 6: Diagnostics and Convergence** - Error diagnostics, suppression directives, final snapshot convergence

## Phase Details

### Phase 1: Test Infrastructure and Hash Verification
**Goal**: Tooling and foundational algorithms are verified against all snapshots before any codegen begins
**Depends on**: Nothing (first phase)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, HASH-01, HASH-02, HASH-03, HASH-04, HASH-05
**Success Criteria** (what must be TRUE):
  1. Snapshot parser loads any `.snap` file and extracts INPUT, segment outputs, metadata JSON, and diagnostics as structured data
  2. AST comparison correctly identifies semantically equivalent code as matching and semantically different code as non-matching (ignoring whitespace/formatting)
  3. SipHash-1-3 with zero keys produces hashes byte-identical to every hash value found in all snapshot metadata
  4. Display names and symbol names constructed from file path and context match every snapshot's metadata exactly
  5. Test runner can execute a batch of N snapshots, report pass/fail, and lock passing batches so they never regress
**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md — Project setup and snapshot parser (TEST-01)
- [x] 01-02-PLAN.md — SipHash-1-3 hashing and naming construction (HASH-01 through HASH-05)
- [x] 01-03-PLAN.md — AST comparison, metadata comparison, and batch runner (TEST-02, TEST-03, TEST-04)

### Phase 2: Core Extraction Pipeline
**Goal**: The optimizer can parse source files, detect marker functions, extract segments, rewrite parent modules, and produce the correct module structure
**Depends on**: Phase 1
**Requirements**: EXTRACT-01, EXTRACT-02, EXTRACT-03, EXTRACT-04, EXTRACT-05, EXTRACT-06, EXTRACT-07, CALL-01, CALL-02, CALL-03, CALL-04, CALL-05, IMP-01, IMP-02, IMP-03, IMP-04, IMP-05, IMP-06, API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. Given a source file with `$()` calls, the optimizer produces separate segment modules with correct exported constants and deterministic names
  2. The parent module is rewritten with QRL references (`qrl(() => import(...))`) replacing `$()` calls, including nested segments with correct parent-child relationships
  3. Call forms are rewritten correctly (`component$` to `componentQrl`, `useTask$` to `useTaskQrl`, `sync$` to `_qrlSync`, etc.) with `/*#__PURE__*/` annotations
  4. Import paths are rewritten (`@builder.io/qwik` to `@qwik.dev/core`, etc.) and necessary imports are added to both parent and segment modules without duplication
  5. `transformModule()` function accepts the same options interface as the NAPI binding and returns transformed code, segment array, and diagnostics
**Plans:** 5 plans

Plans:
- [x] 02-01-PLAN.md — API types, dependency installation, and import path rewriting (EXTRACT-07, API-03, IMP-01..03)
- [x] 02-02-PLAN.md — Context stack for naming and marker function detection (EXTRACT-01)
- [x] 02-03-PLAN.md — Extraction engine, segment codegen, and call form rewriting (EXTRACT-02, EXTRACT-04, EXTRACT-07, IMP-05, CALL-01..05)
- [x] 02-04-PLAN.md — Parent module rewriting with magic-string, nested segments, custom inlined functions (EXTRACT-03, EXTRACT-05, EXTRACT-06, IMP-04, IMP-06)
- [ ] 02-05-PLAN.md — transformModule() public API and snapshot batch validation (API-01, API-02)

### Phase 3: Capture Analysis and Variable Migration
**Goal**: The optimizer correctly identifies variables crossing `$()` boundaries, injects capture machinery, and migrates movable declarations
**Depends on**: Phase 2
**Requirements**: CAPT-01, CAPT-02, CAPT-03, CAPT-04, CAPT-05, CAPT-06, MIG-01, MIG-02, MIG-03, MIG-04, MIG-05
**Success Criteria** (what must be TRUE):
  1. Variables referenced inside a `$()` closure but declared outside are detected as captures, including edge cases with `var` hoisting and destructured bindings
  2. Segment modules receive `_captures` array unpacking for captured variables, and parent modules receive `.w([captured1, captured2])` wrapping on QRL references
  3. Variables used only by one segment are migrated into that segment's module; shared variables are re-exported from parent as `_auto_VARNAME`
  4. Exported variables and declarations with side effects are never migrated
  5. Capture metadata (captures, captureNames, paramNames) in segment output matches snapshot expectations exactly
**Plans**: TBD

### Phase 4: JSX, Signals, and Event Handlers
**Goal**: JSX elements are transformed to optimized `_jsxSorted` calls with signal-aware prop classification, event handler extraction, and loop-context hoisting
**Depends on**: Phase 3
**Requirements**: JSX-01, JSX-02, JSX-03, JSX-04, JSX-05, JSX-06, SIG-01, SIG-02, SIG-03, SIG-04, SIG-05, EVT-01, EVT-02, EVT-03, EVT-04, EVT-05, EVT-06, BIND-01, BIND-02, BIND-03, LOOP-01, LOOP-02, LOOP-03, LOOP-04, LOOP-05
**Success Criteria** (what must be TRUE):
  1. JSX elements produce `_jsxSorted(tag, varProps, constProps, children, flags, key)` calls with correct prop classification (signals/stores in varProps, literals in constProps) and deterministic keys
  2. Signal expressions in JSX props are wrapped with `_wrapProp` or generate `_fnSignal` with hoisted `_hf` module-scope functions as appropriate
  3. Event handlers (`onClick$`, `document:onFocus$`, `window:onClick$`, etc.) are extracted as segments and transformed to `q-e:click`, `q-d:focus`, `q-w:click` in constProps
  4. Event handlers inside loops have their `.w([captures])` hoisted above the loop, with `q:p`/`q:ps` injection and positional parameter padding
  5. `bind:value` and `bind:checked` produce value prop + `q-e:input` handler with `inlinedQrl`
**Plans**: TBD
**UI hint**: yes

### Phase 5: Entry Strategies and Build Modes
**Goal**: The optimizer supports all entry strategies and build mode configurations that Qwik's Vite plugin can request
**Depends on**: Phase 4
**Requirements**: ENT-01, ENT-02, ENT-03, ENT-04, MODE-01, MODE-02, MODE-03, MODE-04, MODE-05, MODE-06, MODE-07
**Success Criteria** (what must be TRUE):
  1. Smart mode (default) produces each segment as a separate file with dynamic import references
  2. Inline/hoist mode produces segments inlined using `_noopQrl` + `.s()` pattern instead of separate files
  3. Dev mode generates `qrlDEV()` with file/line/displayName metadata, JSX source info, and `_useHmr(filePath)` in component segments
  4. Server strip mode replaces server-only code with null exports; client strip mode does the same for client-only code; strip exports mode replaces specified exports with throw statements
  5. `isServer`, `isBrowser`, and `isDev` constants are replaced with their correct boolean values based on configuration
**Plans**: TBD

### Phase 6: Diagnostics and Convergence
**Goal**: The optimizer emits correct diagnostics for invalid code patterns and passes all remaining snapshot tests
**Depends on**: Phase 5
**Requirements**: DIAG-01, DIAG-02, DIAG-03, DIAG-04
**Success Criteria** (what must be TRUE):
  1. C02 FunctionReference error is emitted when functions or classes cross a `$()` boundary
  2. C03 CanNotCapture and C05 MissingQrlImplementation errors are emitted for their respective invalid patterns
  3. `@qwik-disable-next-line` comment directive suppresses the next diagnostic
  4. All ~180 snapshot tests pass via AST-based comparison with no regressions from previously locked batches

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Test Infrastructure and Hash Verification | 3/3 | Complete | 2026-04-10 |
| 2. Core Extraction Pipeline | 0/5 | Planning complete | - |
| 3. Capture Analysis and Variable Migration | 0/TBD | Not started | - |
| 4. JSX, Signals, and Event Handlers | 0/TBD | Not started | - |
| 5. Entry Strategies and Build Modes | 0/TBD | Not started | - |
| 6. Diagnostics and Convergence | 0/TBD | Not started | - |
