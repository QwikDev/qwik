# SPEC: `generateAllSegmentModules` refactor

**Linear:** [OSS-347](https://linear.app/kunai/issue/OSS-347)
**Parent:** [OSS-343](https://linear.app/kunai/issue/OSS-343) — Refactor track v2
**Status:** Discovery — produces this SPEC + sub-tickets, not direct code
**File:** `src/optimizer/transform/segment-generation.ts`
**Lines:** 244–824 (~580)
**Phase:** Pipeline Phase 5 — see `OPTIMIZER.md` "Phase 5 — segment generation"

---

## Background

The audit flagged `generateAllSegmentModules` as the highest-friction candidate in the optimizer pipeline:

- 7-param signature (now packaged as a 28-field `SegmentGenerationContext` object — same problem, hidden behind a parameter object).
- Stateful per-iteration mutation of the input `ExtractionResult` records inside the loop (`ext.captureNames`, `ext.captures`, `ext.propsFieldCaptures`).
- 8+ execution branches (inline-vs-default strategy, stripped-vs-non-stripped, top-level-vs-nested, with/without parent, etc.).
- High blast radius because Phase 5 is the *only* code path that produces segment `TransformModule` records — every convergence test depends on it.
- High effort estimate (5–6h).

OSS-347's mandate is to read the function end-to-end, document its actual phases, identify natural seams, and fan out to 1–3 implementation tickets. This document is that output.

---

## Phase decomposition (as currently written)

The function has a clear two-section shape: **setup** (lines 247–316) → **per-extraction loop** (318–821).

### Setup (lines 247–316)

| Step | Lines | What it does |
|---|---|---|
| 1 | 248–256 | Destructure 25 fields from `ctx` |
| 2 | 258–262 | Build `extBySymbol: Map<symbolName, ExtractionResult>` for O(1) lookup |
| 3 | 264–280 | Compute `extractionDepth`, sort `updatedExtractions` children-before-parents (depth-first, leaves first) |
| 4 | 282–283 | Initialise `segmentKeyCounter` from `ctx.parentJsxKeyCounterValue` |
| 5 | 285–287 | `collectSameFileSymbolInfo(program)` → `{sameFileSymbols, defaultExportedNames, renamedExports}` |
| 6 | 289–293 | `collectImportAttributes(program)` + `buildSegmentImportList(...)` |
| 7 | 295–296 | `collectEnumValueMap(program, shouldTranspileTs)` for TS-enum value inlining |
| 8 | 298–316 | Pre-compute `fieldMaps: ReadonlyMap<parentSymbol, ReadonlyMap<fieldName, parentExpr>>` for parents that have child extractions; uses an IIFE for immutability (added in OSS-345) |

### Per-extraction loop (lines 318–821)

For each non-`isSync` extraction, the loop runs (in order):

| Step | Lines | What it does |
|---|---|---|
| 9 | 319 | Skip if `ext.isSync` |
| 10 | 321–331 | `stripped = isStrippedSegment(...)`; if stripped, force `ext.loc = [0,0]` |
| 11 | 333–362 | **Inline-strategy `_rawProps` consolidation for metadata** — only when `isInlineStrategy && ext.parent !== null && ext.captureNames.length > 0`; rewrites `ext.captureNames`, `ext.captures`, `ext.propsFieldCaptures` |
| 12 | 364–401 | **Inline-strategy early emit** — builds `SegmentMetadataInternal`, pushes a `TransformModule` with empty/stripped code, `continue`s |
| **13** | 403–453 | **Default-strategy: `nestedQrlDecls`** — for each child, build either a noop QRL declaration (if stripped) or a regular `qrl(...)`/`qrlDEV(...)` declaration; tracks `childQrlVarNames: Map<symbolName, qrlVarName>` |
| 14 | 455–460 | Initialise `captureInfo: SegmentCaptureInfo` |
| 15 | 462–483 | **Default-strategy `_rawProps` consolidation for codegen** — same logic as step 11 but writes `captureInfo.captureNames`, `captureInfo.propsFieldCaptures` (and *also* mutates `ext.captureNames`, `ext.captures`) |
| 16 | 485–490 | Wire `captureInfo.constLiterals` from `constLiteralsMap` (added by OSS-354) |
| **17** | 492–607 | **Top-level-only migration wiring** — only when `ext.parent === null && !ext.isInlinedQrl`; ~115 lines covering: |
| 17a | 494–514 | `reexport`-action auto-imports |
| 17b | 516–581 | `move`-action moved declarations — walks the AST to collect identifier deps, then resolves each to either an original import, a same-file symbol, or a default-export reference |
| 17c | 583–593 | Filter migrated vars from `ext.captureNames` |
| 17d | 595–604 | Reconcile captures with `paramNames` (set `captures = false` if all captureNames are also paramNames) |
| 17e | 606 | Sync `captureInfo.captureNames` |
| **18** | 609–701 | **Nested call-site info** — for each child, build a `NestedCallSiteInfo`; branches on `isJsxAttr` (event-handler with `$` suffix) vs regular call. JSX-attr branch handles event-prop-name transform, passive-event detection, loop-cross-capture detection, loop-local-param computation |
| 19 | 703–706 | `effectiveCaptureInfo = resolveCaptureInfo(captureInfo, ext.isInlinedQrl)` — strips `captureInfo` for `inlinedQrl` segments |
| 20 | 708–724 | Build `importContext: SegmentImportData` |
| 21 | 726–752 | Generate segment code: `generateStrippedSegmentCode(symbolName)` if stripped, else `generateSegmentCode(...)` (the OSS-346 9-phase sequencer) |
| 22 | 754–757 | Update `segmentKeyCounter` from `segmentResult.keyCounterValue` |
| 23 | 759–772 | If non-stripped, `postProcessSegmentCode(...)` |
| 24 | 774–786 | Resolve `parentComponentSymbol` (only for `entryStrategy.type === "component"`; walks parent chain) |
| 25 | 787–793 | `entryField = resolveEntryField(...)` |
| 26 | 795–810 | Build `SegmentMetadataInternal` |
| 27 | 812–820 | Build `TransformModule`, push to `allModules` |

---

## Identified seams

Reading the function end-to-end, **five natural seams** emerge:

### Seam 1 — Setup is one immutable record

Steps 1–8 produce inputs that are read-only across the loop. They can be extracted as one helper that returns an immutable `Prep` record.

```ts
interface SegmentGenerationPrep {
  extBySymbol: ReadonlyMap<string, ExtractionResult>;
  sortedExtractions: readonly ExtractionResult[];
  sameFileSymbols: ReadonlySet<string>;
  defaultExportedNames: ReadonlySet<string>;
  renamedExports: ReadonlyMap<string, string>;
  segmentImportList: SegmentImportData["moduleImports"];
  enumValueMap: ReadonlyMap<string, ReadonlyMap<string, string>>;
  fieldMaps: ReadonlyMap<string, ReadonlyMap<string, string>>;
}
```

The current code already has this structure implicitly (the IIFE on lines 303–316 and the named lookup maps on 259, 286, 290, 296). Naming it makes the orchestrator obvious.

### Seam 2 — Inline-strategy is a self-contained branch

Steps 11–12 (lines 333–401) handle inline/hoist strategy entirely: rawProps consolidation for metadata + emit a metadata-only `TransformModule` and `continue`. Extracts as `buildInlineStrategySegment(ext, ctx, prep, stripped) → TransformModule`.

### Seam 3 — Default-strategy is the rest

Everything from step 13 onward (lines 403–820, ~420 lines) is the default-strategy path. Extracts as `buildDefaultStrategySegment(ext, ctx, prep, stripped, segmentKeyCounter) → { module: TransformModule, keyCounterValue: number | undefined }`.

Inside `buildDefaultStrategySegment`, three further seams:

### Seam 4 — Migration wiring (top-level segments only)

Step 17 (lines 492–607) only fires when `ext.parent === null && !ext.isInlinedQrl`. It's structurally distinct from everything around it — `reexport` auto-imports, `move` declaration inlining (with a full AST walk), capture filtering, capture/param reconciliation. ~115 lines of self-contained logic.

Extracts as `wireTopLevelMigration(ext, captureInfo, ctx, prep) → void` (the function mutates `captureInfo` and `ext` in place — keeps the surface API simple, but worth flagging the side-effect explicitly).

### Seam 5 — Nested call-site building

Step 18 (lines 609–701) builds the per-child `NestedCallSiteInfo[]` array with significant per-call-site logic (event-prop-name transform, passive event detection, loop-cross-capture detection, loop-local-param computation). ~92 lines.

Extracts as `buildNestedCallSites(ext, children, childQrlVarNames, ctx) → NestedCallSiteInfo[]`.

### (Bonus seam) — `_rawProps` consolidation is duplicated

Steps 11 and 15 do the same consolidation logic against the same `fieldMap` lookup, with one writing to `ext.propsFieldCaptures` (metadata path) and the other writing to `captureInfo.propsFieldCaptures` (codegen path). Both also mutate `ext.captureNames` and `ext.captures` identically.

A shared helper `consolidateRawPropsCaptures(ext, fieldMap, target: "ext" | "captureInfo")` (or two helpers — one returning a `RawPropsResult` the caller applies) removes the duplication.

---

## Proposed shape

After all five seams are extracted, the orchestrator becomes ~80 lines:

```ts
export function generateAllSegmentModules(
  ctx: SegmentGenerationContext,
): TransformModule[] {
  const prep = computeSegmentGenerationPrep(ctx);
  let segmentKeyCounter = ctx.parentJsxKeyCounterValue;
  const allModules: TransformModule[] = [];

  for (const ext of prep.sortedExtractions) {
    if (ext.isSync) continue;

    const stripped = isStrippedSegment(
      ext.ctxName, ext.ctxKind,
      ctx.options.stripCtxName, ctx.options.stripEventHandlers,
    );
    if (stripped) ext.loc = [0, 0];

    if (ctx.isInlineStrategy) {
      allModules.push(buildInlineStrategySegment(ext, ctx, prep, stripped));
      continue;
    }

    const result = buildDefaultStrategySegment(
      ext, ctx, prep, stripped, segmentKeyCounter,
    );
    if (result.keyCounterValue !== undefined) {
      segmentKeyCounter = result.keyCounterValue;
    }
    allModules.push(result.module);
  }

  return allModules;
}
```

`buildDefaultStrategySegment` itself becomes a sequencer (~50 lines) calling the three sub-helpers. The two strategy-builders + the orchestrator total ~150 lines; the four extracted phase helpers total ~430 lines (vs the current 580 inline, mostly because helpers carry their own type signatures and minor scaffolding).

The five extractions in detail:

1. `computeSegmentGenerationPrep(ctx) → SegmentGenerationPrep` — ~75 lines
2. `consolidateRawPropsCaptures(ext, fieldMap, target) → void | RawPropsResult` — shared helper, ~30 lines (replaces ~30 lines of duplicated logic)
3. `buildInlineStrategySegment(ext, ctx, prep, stripped) → TransformModule` — ~50 lines
4. `wireTopLevelMigration(ext, captureInfo, ctx, prep) → void` — ~115 lines
5. `buildNestedCallSites(ext, children, childQrlVarNames, ctx) → NestedCallSiteInfo[]` — ~95 lines
6. `buildNestedQrlDeclarations(ext, children, ctx, isDevMode) → { nestedQrlDecls: string[], childQrlVarNames: Map<string, string> }` — ~50 lines
7. `buildDefaultStrategySegment(ext, ctx, prep, stripped, segmentKeyCounter) → { module, keyCounterValue }` — ~75 lines, sequencer

That's six helpers + one orchestrator, vs the current single 580-line function.

---

## Ticket fan-out decision

OSS-347's AC asks: "Decide: one PR vs N sub-tickets."

**Recommendation: three sub-tickets.**

- **One PR (~5–6h):** Too much surface for a single review. The audit's effort estimate matches the OSS-346 PR (which extracted 2 helpers from an 87-line orchestrator), and OSS-347's surface is ~7× larger.
- **Two sub-tickets (~3h each):** Possible, but the natural cleavage between "easy/foundation" and "harder/main strategy" makes three feel right.
- **Three sub-tickets (~1.5–2h each):** Cleanest. Each is independently shippable, testable against the convergence baseline, and small enough to review in one sitting.

### Sub-ticket A — Prep + inline-strategy extraction

Extracts seams 1, 2, and 3 (the easier half). After this PR, the orchestrator's setup phase is named, the inline branch is named, and a shared `consolidateRawPropsCaptures` helper exists.

- Effort: ~1.5h
- Blast radius: low — pure extraction, no behaviour change
- Verification: convergence + full-suite no-regression
- Files touched: `src/optimizer/transform/segment-generation.ts` only

### Sub-ticket B — Default-strategy decomposition

Extracts seams 4 and 5 (the bigger pieces — migration wiring + nested call-site building) plus `buildNestedQrlDeclarations`. After this PR, only the per-extraction sequencing logic remains in `buildDefaultStrategySegment`.

- Effort: ~2–3h
- Blast radius: medium — touches the migration code path which has had recent work (OSS-338 MIG-05a, OSS-353 closure-node threading)
- Verification: convergence + full-suite + the failure-families.test.ts secondary signal
- Files touched: `src/optimizer/transform/segment-generation.ts` only

### Sub-ticket C — Default-strategy sequencer rename + final cleanup

Extracts `buildDefaultStrategySegment` itself (the per-extraction sequencer) and applies the orchestrator shape proposed above. This is the smallest mechanical-extract sub-ticket but it's the one that actually crystallises the shape — without it, the orchestrator still has the old per-extraction body inline.

- Effort: ~1h
- Blast radius: low — pure extraction once Sub-A and Sub-B land
- Verification: convergence + full-suite
- Files touched: `src/optimizer/transform/segment-generation.ts` only

### Sequencing

A → B → C strictly. Sub-A's `Prep` record is needed by both B and C; B's helpers must exist before C can sequence them. Don't start B before A merges; don't start C before B merges.

---

## Risk

**Per-iteration mutation of `ext` is the highest-risk pattern in this function.** Step 11 (line 358), step 15 (lines 479–480), step 17c (line 590), and step 17d (line 602) all mutate fields on the input `ExtractionResult`. The mutations *are* observed by the same iteration's later steps (e.g. step 21's `generateSegmentCode` reads `ext.captureNames` and `ext.captures`), so we cannot trivially make `ext` immutable without restructuring all readers.

**The refactor preserves these mutations** (it just relocates them to named helpers). Any behaviour change here would be a regression. Verification: every helper extraction must be a pure rename — same writes, same reads, same order.

**Recent churn in the same code path** raises the bar for verification:

- OSS-338 (MIG-05a post-pass) reshaped migration decisions
- OSS-353 (closure-node threading) changed how AST nodes flow through Phase 5
- OSS-354 (closure-form const literals) added `constLiteralsMap` (used at line 486)

Each sub-PR must run convergence + full-suite + failure-families before merge.

---

## Open questions

1. **Should `ext` mutation be eliminated as a follow-up?** The function builds a per-segment `captureInfo` already; lifting `ext.captureNames`, `ext.captures`, `ext.propsFieldCaptures` into the same record would let callers stop mutating their input. **Out of scope for OSS-347's three sub-tickets** — would be a separate "data-model cleanup" workstream. Worth filing as OSS-348-shaped backlog after OSS-347 lands.

2. **Should `SegmentGenerationContext` itself be split?** 28 fields suggests at least three logical groups: parsing/AST data (`program`, `originalImports`, `importedNames`, `enclosingExtMap`, `elementQpParamsMap`, ...), build-mode flags (`emitMode`, `isInlineStrategy`, `entryStrategy`, `shouldTranspileJsx`, `shouldTranspileTs`, ...), and migration data (`migrationDecisions`, `moduleLevelDecls`, `moduleLevelDeclsByName`, `segmentUsage`, ...). **Also out of scope for OSS-347** — touches every caller of `transformModule`, much higher blast radius. Backlog candidate.

3. **Is `buildNestedQrlDeclarations`'s extraction worthwhile?** The 50-line code-string-building block produces an array of strings and a map; it's a clean side-effect-free helper but small. **Recommend extracting** (improves readability of `buildDefaultStrategySegment`); easy to fold back inline if review prefers.

---

## Acceptance criteria (for OSS-347 itself)

- [x] SPEC document written describing the proposed refactor shape ← *this file*
- [x] Decision recorded: **three sub-tickets** (one PR each, sequenced A → B → C)
- [ ] Sub-tickets drafted in chat with the same scope + acceptance pattern as OSS-338–340 ← *next step after this SPEC merges*
- [ ] No code changes in this PR — implementation lands in follow-up tickets ← *enforced by branch scope*
- [ ] Branch `refactor/generate-all-segment-modules-spec`, single PR off `main` (PR contains only the SPEC document) ← *enforced by branch scope*
