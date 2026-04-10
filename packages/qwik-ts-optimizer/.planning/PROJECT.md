# Qwik Optimizer (TypeScript)

## What This Is

A drop-in TypeScript replacement for Qwik's Rust/SWC optimizer. It takes Qwik source files containing `$()` boundaries and extracts segments (lazy-loadable closures), computes captures, generates QRLs, and emits transformed output. Consumed as a library function by Qwik core's existing Vite plugin.

## Core Value

The optimizer must produce output that is runtime-identical to the SWC optimizer — same segments extracted, same captures computed, same hashes generated — so existing Qwik apps work without changes.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Parse TS/TSX/JS/JSX source files via oxc-parser
- [ ] Strip TypeScript syntax via oxc-transform
- [ ] Detect marker function calls (names ending with `$`) and extract segment closures
- [ ] Compute scoped identifiers (captures) crossing `$()` boundaries using oxc-walker's scope tracking
- [ ] Generate deterministic symbol names and hashes matching the SWC algorithm
- [ ] Emit transformed parent module with QRL references replacing `$()` calls
- [ ] Emit extracted segment modules with correct imports and captures
- [ ] Handle JSX transforms: `_jsxSorted`, `_jsxSplit`, varProps/constProps classification, flags bitmask
- [ ] Handle `_fnSignal` / `_wrapProp` inlining for signal expressions in JSX props
- [ ] Handle variable migration (moving declarations from parent to segment when safe)
- [ ] Handle hoisted QRL patterns (module-scope dedup + loop-context `.w()` hoisting)
- [ ] Handle `component$` → `componentQrl`, `useStylesScoped$` → `useStylesScopedQrl`, etc. call form rewrites
- [ ] Handle event handler extraction (`onClick$` → `q-e:click` with capture parameters)
- [ ] Handle `q:p` / `q:ps` capture injection for event handlers on elements
- [ ] Handle import renaming (`@builder.io/*` → `@qwik.dev/*`)
- [ ] Handle const replacement (`isServer`, `isBrowser`, `isDev`)
- [ ] Handle strip server/client code modes
- [ ] Handle strip exports mode
- [ ] Emit diagnostics (C02 FunctionReference, C03 CanNotCapture, C05 MissingQrlImplementation)
- [ ] Support all entry strategies (smart, single, component, inline/hoist)
- [ ] Expose a `transformModule()` function consumable by the existing Vite plugin
- [ ] Pass all ~180 snapshot tests via AST-based comparison (semantic equivalence, not string identity)

### Out of Scope

- Vite plugin hooks — the existing Qwik core Vite plugin handles integration
- Source map generation — can be added later, not needed for functional parity
- Dead code elimination — Rolldown/esbuild handles this downstream
- SWC-specific passes (resolver, hygiene, fixer) — not needed with magic-string codegen approach
- Matching SWC's exact whitespace/formatting in output — only semantic equivalence required

## Context

- The current Qwik optimizer is written in Rust using SWC, exposed via NAPI to the Vite plugin
- A prior attempt to rewrite the optimizer in Rust using oxc failed to converge on matching all snapshots despite having a comprehensive 5-chapter behavioral spec — AST comparison, string diff, and spec-based approaches all failed because SWC's incidental behavior was treated as the spec
- The key insight: match runtime behavior (segments, captures, hashes, QRL structure) not SWC's exact codegen
- ~180 snapshot test files exist in `match-these-snaps/` — each contains INPUT, expected segment outputs with metadata, and diagnostics
- The snapshots themselves are the authoritative spec (the written spec is outdated relative to current snapshots)
- Testing strategy: batch 10 snapshots at a time, get them green, lock in CI, add 10 more — never go backwards
- Comparison strategy: segment metadata (name, hash, captures, paramNames) compared exactly; code bodies compared via AST parse; source maps and byte offsets skipped

## Tech Stack

- **Parser**: oxc-parser (native Rust via NAPI — full TS/TSX/JS/JSX support)
- **TS strip**: oxc-transform (native)
- **AST walking**: oxc-walker (pure JS — walk + ScopeTracker + getUndeclaredIdentifiersInFunction)
- **Codegen**: magic-string (surgical text replacement on original source, no full AST reprint)
- **Testing**: vitest with custom snapshot comparison (AST-based)
- **Language**: TypeScript

## Constraints

- **API compatibility**: Must be a drop-in replacement for the NAPI module — same function signature, same output shape
- **Hash stability**: Must use the same hash algorithm as SWC optimizer so QRL references resolve correctly
- **Runtime correctness**: Output must produce working Qwik apps — hydration, lazy-loading, segment resolution all functional
- **No double codebase**: Single TS implementation, not a parallel system alongside SWC

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript over Rust/Zig | Team writes TS, prior Rust rewrite failed to converge, AI works better with TS on ESTree | -- Pending |
| oxc-parser + oxc-walker + magic-string | Native parse speed, JS-side scope tracking via oxc-walker, surgical text edits avoid full codegen | -- Pending |
| AST comparison for tests | String comparison failed in prior attempt, AST comparison ignores cosmetic differences while catching semantic ones | -- Pending |
| Batch testing (10 at a time) | Prevents goalpost-moving where fixing one snapshot breaks others, creates a ratchet | -- Pending |
| Skip source map comparison | Source maps encode byte positions that will differ between implementations, not relevant to runtime correctness | -- Pending |
| Snapshots are the spec | Written spec is outdated, snapshots reflect current expected behavior | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-10 after initialization*
