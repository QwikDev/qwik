# Architecture Patterns

**Domain:** Multi-stage JavaScript compiler/optimizer (Qwik segment extraction)
**Researched:** 2026-04-10

## Recommended Architecture

A **two-pass pipeline with shared context** operating on a single MagicString instance. Not a traditional multi-pass compiler -- the two passes serve distinct purposes (analysis vs. mutation), and all mutations compose on the same string buffer using original-source positions.

```
                        PASS 1: ANALYSIS (read-only)
                        ============================
  Source Code
      |
      v
  [1. Parse]  oxc-parser --> ESTree AST
      |
      v
  [2. TS Strip]  oxc-transform --> JS-only source + position map
      |
      v
  [3. Walk + Scope Build]  oxc-walker(walk + ScopeTracker)
      |                     --> collect $() call sites
      |                     --> build scope chain
      |                     --> freeze ScopeTracker
      |
      v
  [4. Capture Analysis]  getUndeclaredIdentifiersInFunction per segment
      |                   --> for each $() closure, compute which identifiers
      |                   --> cross the boundary (declared outside, used inside)
      |
      v
  [5. Segment Planning]  Determine segment tree, naming, hashing
      |                   --> parent/child relationships
      |                   --> symbol name generation
      |                   --> hash computation
      |
      v
  TransformContext (immutable analysis result)
  ============================================
  - segments[]: { node, name, hash, captures[], parentSegment, ctxKind, ctxName, paramNames }
  - importRewrites: Map<oldSpecifier, newSpecifier>
  - constReplacements: Map<identifier, value>
  - jsxTransforms[]: { node, classification }

                        PASS 2: CODEGEN (write-only)
                        ============================
  TransformContext + MagicString(originalSource)
      |
      v
  [6. Parent Module Rewrite]
      |   - Replace $() call sites with QRL references
      |   - Rewrite imports (add qrl, componentQrl, etc.)
      |   - Rewrite call forms (component$ -> componentQrl)
      |   - Replace const values (isServer, isBrowser, isDev)
      |   - Rewrite import specifiers (@builder.io/* -> @qwik.dev/*)
      |   - Strip server/client code if configured
      |   - Hoist QRL declarations to module top
      |
      v
  [7. Segment Module Generation]
      |   - For each segment: extract closure body text from original source
      |   - Rewrite parameters (destructured props -> _rawProps + captures)
      |   - Add capture unpacking (const x = _captures[0])
      |   - Add necessary imports
      |   - Handle variable migration (move declarations from parent when safe)
      |
      v
  [8. JSX Transform]  (applied within both parent and segment codegen)
      |   - _jsxSorted with varProps/constProps split
      |   - _fnSignal / _wrapProp for reactive prop expressions
      |   - Event handler extraction (onClick$ -> q-e:click)
      |   - q:ps capture injection for event handler captures
      |   - Flags bitmask computation
      |
      v
  TransformOutput
  - parentModule: { code, map? }
  - segments[]: { code, map?, metadata }
  - diagnostics[]: { code, message, loc }
```

### Why Two Passes, Not One

A single-pass approach (analyze-and-mutate simultaneously) fails for this optimizer because:

1. **Segment nesting requires full tree knowledge.** A `$()` inside a `component$` inside another `$()` creates a segment tree. You need the full tree before you can generate symbol names (which encode the path: `Foo_component_1_DvU6FitWglY`), compute hashes, and determine parent references.

2. **Capture analysis needs frozen scopes.** `getUndeclaredIdentifiersInFunction` in oxc-walker requires calling `ScopeTracker.freeze()` first, which means the full walk must complete before capture queries begin. This is architecturally correct -- captures are a cross-cutting concern that depends on the complete scope picture.

3. **Event handler capture merging (`q:ps`) needs sibling knowledge.** Multiple event handlers on the same element share a single `q:ps` array. You need to know all handlers and their captures before generating any of them.

4. **magic-string edits use original positions.** All edits reference the original source positions. This is a feature, not a constraint -- it means the order of mutations within Pass 2 does not matter, and mutations cannot conflict with each other as long as they target non-overlapping ranges.

### Why NOT magic-string-stack

`magic-string-stack` (antfu) adds `.commit()` to create multi-pass editing where each pass operates on the previously-transformed string. This is unnecessary and harmful here:

- **Unnecessary:** All mutations can reference original-source positions because we're replacing known AST node ranges. No mutation needs to "see" the result of a prior mutation.
- **Harmful:** Using `.commit()` between passes would shift positions, making it impossible to use the AST node positions collected in Pass 1 for Pass 2 edits. The whole point of magic-string is position-stable editing.

The one exception: segment module generation creates *new* strings (not edits to the original). For each segment, create a fresh `MagicString` from the extracted closure text, or build segment code via string concatenation (simpler, since segments are generated from scratch).

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `Parser` | Parse source via oxc-parser, strip TS via oxc-transform | Provides AST + JS source to Walker |
| `Walker` | Walk AST with ScopeTracker, collect segment sites | Provides segment nodes + frozen scopes to Analyzer |
| `Analyzer` | Compute captures, build segment tree, generate names/hashes | Provides TransformContext to Codegen |
| `ParentCodegen` | Rewrite parent module via MagicString | Reads TransformContext, writes parent output |
| `SegmentCodegen` | Generate each segment module | Reads TransformContext + original source, writes segment outputs |
| `JSXTransform` | Classify and rewrite JSX elements | Called by both ParentCodegen and SegmentCodegen |
| `Diagnostics` | Collect and emit warnings/errors | Receives diagnostic events from all stages |

### Data Flow

**TransformContext** is the central data structure. It is built incrementally during Pass 1 and consumed read-only during Pass 2.

```typescript
interface TransformContext {
  // From Parser
  ast: Program;
  jsSource: string;           // TS-stripped source (magic-string operates on this)
  
  // From Walker
  segmentSites: SegmentSite[];  // Raw $() call locations with AST nodes
  scopeTracker: ScopeTracker;   // Frozen after walk completes
  
  // From Analyzer
  segments: Segment[];          // Fully resolved segment tree
  importRewrites: ImportRewrite[];
  constReplacements: Map<string, string>;
  
  // From Codegen (output)
  parentCode: string;
  segmentOutputs: SegmentOutput[];
  diagnostics: Diagnostic[];
}

interface Segment {
  name: string;                 // e.g., "Foo_component_HTDRsvUbLiE"
  hash: string;                 // e.g., "HTDRsvUbLiE"
  displayName: string;          // e.g., "test.tsx_Foo_component"
  canonicalFilename: string;    // e.g., "test.tsx_Foo_component_HTDRsvUbLiE"
  extension: string;            // "js" | "jsx" | "tsx"
  
  closureNode: Node;            // AST node of the extracted closure
  closureStart: number;         // Start offset in jsSource
  closureEnd: number;           // End offset in jsSource
  
  parentSegment: Segment | null;
  children: Segment[];
  
  captures: CapturedIdentifier[];  // Identifiers crossing the $() boundary
  paramNames: string[];
  
  ctxKind: 'function' | 'eventHandler';
  ctxName: string;              // e.g., "component$", "onClick$"
  
  callSiteNode: Node;           // The $() or name$() call expression
  isEntry: boolean;
}

interface CapturedIdentifier {
  name: string;
  declarationScope: string;     // Scope key from ScopeTracker
  isRenameable: boolean;        // Can be migrated to segment (moved declaration)
}
```

## Patterns to Follow

### Pattern 1: Analyze-Then-Mutate Separation

**What:** Strict separation between read-only analysis (Pass 1) and write-only mutation (Pass 2). No MagicString operations during analysis. No AST queries during codegen.

**When:** Always. This is the core architectural invariant.

**Why:** Prevents position corruption, enables parallel segment generation, makes debugging deterministic (you can inspect TransformContext between passes).

```typescript
// GOOD: Clean separation
function transformModule(source: string, options: TransformOptions): TransformOutput {
  // Pass 1: Analysis
  const ctx = analyze(source, options);
  
  // Pass 2: Codegen
  const parent = generateParent(ctx);
  const segments = ctx.segments.map(seg => generateSegment(seg, ctx));
  
  return { parent, segments, diagnostics: ctx.diagnostics };
}
```

### Pattern 2: Segment Tree, Not Flat List

**What:** Segments form a tree (parent/child relationships), not a flat list. Process inner-to-outer for extraction, outer-to-inner for parent rewriting.

**When:** Always. Nested `$()` calls are common (`component$` containing `$()` containing `onClick$`).

**Why:** Symbol naming encodes the path (`Foo_component_1_DvU6FitWglY`). Capture analysis must distinguish between captures crossing one `$()` boundary vs. two. The `parent` field in segment metadata requires knowing the tree structure.

```typescript
// Build tree during analysis
function buildSegmentTree(sites: SegmentSite[]): Segment[] {
  // Sort by source position (start offset)
  // For each site, find the innermost enclosing segment -> that's the parent
  // Root segments have parentSegment = null
}
```

### Pattern 3: Position-Stable Editing via MagicString

**What:** All edits to the parent module use a single MagicString instance with original-source positions from AST nodes. Edits are unordered and non-overlapping.

**When:** Parent module codegen (Pass 2).

**Why:** magic-string handles the bookkeeping of shifted positions internally. As long as edits don't overlap, they compose correctly regardless of application order. AST node positions (`.start`, `.end`) from Pass 1 remain valid throughout Pass 2.

```typescript
function generateParent(ctx: TransformContext): string {
  const s = new MagicString(ctx.jsSource);
  
  // These can happen in any order:
  for (const seg of ctx.segments.filter(s => !s.parentSegment)) {
    // Replace $(() => { ... }) with qrl reference
    s.overwrite(seg.callSiteNode.start, seg.callSiteNode.end, qrlReference);
  }
  
  // Prepend QRL declarations and import rewrites
  s.prepend(qrlDeclarations);
  
  return s.toString();
}
```

### Pattern 4: Fresh Strings for Segment Modules

**What:** Each segment module is built as a new string (not edited from the original source). Extract the closure body text from the original source, then construct the segment module around it.

**When:** Segment codegen.

**Why:** Segments are new files. They need their own import blocks, capture unpacking, and potentially rewritten parameters. Building from scratch (with the closure body sliced from original source) is cleaner than trying to edit a copy of the original.

```typescript
function generateSegment(seg: Segment, ctx: TransformContext): string {
  const closureBody = ctx.jsSource.slice(seg.closureStart, seg.closureEnd);
  const s = new MagicString(closureBody);
  
  // Apply local edits (parameter rewriting, capture injection)
  // ... s.overwrite(), s.prepend(), etc.
  
  // Build full segment with imports prepended
  const imports = computeSegmentImports(seg, ctx);
  return imports + '\n' + s.toString();
}
```

### Pattern 5: JSX Classification as a Sub-Analysis

**What:** JSX prop classification (varProps vs constProps, signal detection, event handler detection) runs as part of Pass 1 analysis, not during codegen. The classification result is stored in TransformContext.

**When:** Any segment or parent module containing JSX.

**Why:** JSX transforms are complex (see the derived signals example: `_fnSignal`, `_wrapProp`, hoisted helper functions `_hf0`). The classification depends on scope analysis (is this identifier a signal? a store? an import?). Doing classification during analysis keeps codegen simple -- it just reads the classification and emits the right code.

```typescript
interface JSXElementInfo {
  node: Node;
  constProps: JSXPropInfo[];
  varProps: JSXPropInfo[];
  eventHandlers: EventHandlerInfo[];
  children: Node | null;
  flags: number;          // Bitmask for _jsxSorted
  devKey: string;         // e.g., "u6_0"
}

interface JSXPropInfo {
  name: string;
  valueNode: Node;
  signalKind: 'none' | 'wrapProp' | 'fnSignal';
  fnSignalArgs?: { fn: string, fnStr: string, deps: string[] };
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mutating During Walk

**What:** Calling MagicString methods inside the `enter`/`leave` callbacks of the AST walk.

**Why bad:** If you mutate the string during the walk, you can't use the same string for subsequent analysis (like capture computation). Even though magic-string uses original positions, the conceptual mixing of analysis and mutation makes the code fragile and hard to debug. You also can't parallelize segment generation if analysis hasn't fully completed.

**Instead:** Collect all transformation intents during the walk, apply them all in a separate codegen phase.

### Anti-Pattern 2: Re-parsing Transformed Output

**What:** Parsing the MagicString output to perform further transformations.

**Why bad:** Creates a position discontinuity. The new AST has different positions than the original. Now you need position mapping between old and new ASTs. This is the path SWC takes (multiple AST passes with resolver/hygiene/fixer), and it's exactly what magic-string is designed to avoid.

**Instead:** All edits reference original-source positions. If you need to make edits that depend on other edits, model the dependency in your TransformContext, not by re-parsing.

### Anti-Pattern 3: Generating Segment Code via AST Printer

**What:** Building segment code by constructing AST nodes and running them through an AST-to-source printer.

**Why bad:** You don't have an AST printer (oxc-parser is parse-only from JS). You'd need to bring in another tool (escodegen, astring, recast). More importantly, it fights the magic-string approach -- the whole point is to preserve original formatting by doing surgical text edits, not full reprinting.

**Instead:** Slice the closure body text from the original source. Apply targeted edits (parameter rewriting, capture injection) via MagicString on that slice. The output preserves the author's formatting.

### Anti-Pattern 4: Global Mutable State Between Stages

**What:** Stages communicating via shared mutable objects that get modified as a side effect.

**Why bad:** Makes stage ordering fragile, prevents future parallelization, creates mysterious bugs when a stage reads data that a prior stage hasn't finished writing.

**Instead:** Each stage returns its output. TransformContext is built incrementally by composing stage outputs, not by mutating a shared object.

## Component Dependency Graph (Build Order)

```
Level 0 (no dependencies):
  [Types]          - Segment, TransformContext, TransformOptions interfaces
  [Diagnostics]    - Error/warning collection utility

Level 1 (depends on Types):
  [Parser]         - oxc-parser + oxc-transform wrapper
  [HashUtil]       - Deterministic hash generation (must match SWC algorithm)
  [NameUtil]       - Symbol name generation (Foo_component_HTDRsvUbLiE)

Level 2 (depends on Parser):
  [Walker]         - AST walk + ScopeTracker + segment site collection

Level 3 (depends on Walker + HashUtil + NameUtil):
  [Analyzer]       - Capture analysis + segment tree + naming/hashing
  [JSXClassifier]  - JSX prop classification (needs scope info from Walker)

Level 4 (depends on Analyzer + JSXClassifier):
  [ParentCodegen]  - Parent module rewriting
  [SegmentCodegen] - Segment module generation

Level 5 (depends on ParentCodegen + SegmentCodegen):
  [transformModule] - Public API entry point, orchestrates the pipeline
```

### Suggested Build Order for Phases

Based on the dependency graph, build bottom-up:

1. **Types + Diagnostics + HashUtil + NameUtil** -- Foundation. Can be built and tested in isolation. HashUtil needs the exact SWC algorithm (this is a critical correctness requirement; test against known hashes from snapshots).

2. **Parser** -- Thin wrapper around oxc-parser + oxc-transform. Testable with simple inputs. Produces AST + JS source.

3. **Walker** -- Walk AST, collect `$()` sites, build scope chain. This is where oxc-walker's ScopeTracker is integrated. Testable: give it source, verify it finds the right segment sites.

4. **Analyzer** -- Build segment tree from collected sites. Compute captures via `getUndeclaredIdentifiersInFunction`. Generate names and hashes. This is the most complex analysis stage. Testable: verify segment metadata matches snapshot metadata.

5. **ParentCodegen** -- Given a TransformContext, produce the rewritten parent module. Start with simple cases (flat `$()` replacement), add complexity (import rewriting, call form rewriting, const replacement).

6. **SegmentCodegen** -- Given a segment + context, produce the segment module. Start with no-capture segments, then add capture unpacking, then variable migration.

7. **JSX Transform** -- Can be deferred until basic extraction works. JSX is where most of the complexity lives (`_jsxSorted`, `_fnSignal`, `_wrapProp`, event handler extraction, `q:ps`). Build incrementally: plain JSX first, then derived signals, then event handlers.

8. **Integration + Edge Cases** -- Wire everything together in `transformModule()`. Handle entry strategies (smart, single, component, inline/hoist). Handle strip modes. Handle diagnostics.

## Key Architectural Decisions

### Single MagicString for Parent, Fresh Strings for Segments

The parent module is edited in-place via MagicString on the TS-stripped source. Each segment module is a new string construction. This avoids the complexity of multi-file MagicString management.

### oxc-walker's ScopeTracker as the Single Source of Scope Truth

Do not build a custom scope tracker. oxc-walker's ScopeTracker + `getUndeclaredIdentifiersInFunction` provides exactly the capture analysis needed. The `freeze()` mechanism enforces the two-pass discipline -- you must finish walking before querying captures.

### TS Stripping Before Walk, Not After

Strip TypeScript syntax (via oxc-transform) before the analysis walk. This means:
- The AST walk operates on JS-only syntax (simpler visitor logic)
- MagicString operates on the TS-stripped source (positions match the JS AST)
- Type annotations don't pollute scope analysis or capture detection
- The TS-stripped source is the "original" for magic-string purposes

**Caveat:** oxc-transform may shift positions relative to the original TS source. The MagicString must be initialized with the TS-stripped output, not the original TS source. Source maps connecting final output back to original TS are out of scope per PROJECT.md.

### Hash Algorithm Must Be Byte-Identical to SWC

The hash in segment names (e.g., `HTDRsvUbLiE`) must match the SWC optimizer exactly. This is a hard requirement -- Qwik's runtime resolves QRLs by hash, so a different hash means broken lazy loading. Reverse-engineer the hash algorithm from snapshots and/or the SWC Rust source. Test early with known input/hash pairs from snapshots.

## Scalability Considerations

| Concern | At 1 file | At 100 files | At 10K files |
|---------|-----------|--------------|--------------|
| Parse time | ~1ms (oxc is fast) | ~100ms | ~10s (fine, Vite processes in parallel) |
| Memory | One AST in memory | Vite calls per-file, GC between | Same as 100 -- per-file processing |
| Segment count | 1-5 segments | 100-500 segments | 10K-50K (but emitted per-file) |

The optimizer processes one file at a time (called by Vite per-module). No cross-file analysis needed. Memory and performance scale linearly with individual file complexity, not project size.

## Sources

- [oxc-walker GitHub](https://github.com/oxc-project/oxc-walker) -- ScopeTracker API, getUndeclaredIdentifiersInFunction, walk/parseAndWalk
- [magic-string GitHub](https://github.com/Rich-Harris/magic-string) -- Position-stable string editing API
- [magic-string-stack GitHub](https://github.com/antfu/magic-string-stack) -- Evaluated and rejected (unnecessary for this use case)
- [oxc-parser npm](https://www.npmjs.com/package/oxc-parser) -- ESTree AST output, TS/TSX/JS/JSX support
- Snapshot analysis from `match-these-snaps/` directory -- 209 snapshots defining expected behavior
