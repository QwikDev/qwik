# Phase 5: Entry Strategies and Build Modes - Research

**Researched:** 2026-04-10
**Domain:** Qwik optimizer entry strategies, build modes, code stripping, const replacement
**Confidence:** HIGH

## Summary

Phase 5 adds the remaining configuration-driven behaviors to the optimizer: entry strategies (how QRL references are generated), build modes (dev/prod/lib), code stripping (server/client/exports), and const replacement (isServer/isBrowser/isDev). These features are all configuration-gated -- they change how the existing extraction/rewrite pipeline emits code based on `TransformModulesOptions` fields that are already defined in `types.ts` but not yet implemented.

The key insight from snapshot analysis is that most of these features are **relatively isolated transformations** applied at specific pipeline stages. Entry strategies change how QRL declarations are generated in the parent module (and whether segment files are emitted). Build modes add dev metadata or strip code. Strip modes replace segment bodies with `null` or replace export declarations with `throw` statements. Const replacement is a simple identifier substitution.

**Primary recommendation:** Implement features in dependency order: (1) smart entry strategy baseline (current behavior, just wire `entry` metadata), (2) inline/hoist entry strategy, (3) dev mode with qrlDEV, (4) strip modes, (5) const replacement, (6) remaining strategies (component, single/manual).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENT-01 | Smart mode -- each segment as separate file with dynamic import | Current pipeline already does this; need to set `entry` field in SegmentAnalysis |
| ENT-02 | Inline/Hoist mode -- segments inlined using `_noopQrl` + `.s()` pattern | Snapshot `example_inlined_entry_strategy` shows exact output pattern |
| ENT-03 | Component entry strategy -- group segments by component | Sets `entry` field to parent component's symbol name |
| ENT-04 | Manual chunks strategy -- custom grouping via configuration | Uses `manual` map in EntryStrategy to set `entry` field |
| MODE-01 | Development mode -- `qrlDEV()` with file/line/displayName metadata | Snapshot `example_dev_mode` shows qrlDEV call signature |
| MODE-02 | Dev mode JSX source info (fileName, lineNumber, columnNumber) | Snapshot `example_jsx_keyed_dev` shows JSX dev metadata object |
| MODE-03 | HMR injection -- `_useHmr(filePath)` in component segments | Not yet found in snapshots; needs investigation during implementation |
| MODE-04 | Server strip mode -- server-only code replaced with null exports | Snapshot `example_strip_server_code` shows `export const s_HASH = null;` |
| MODE-05 | Client strip mode -- client-only code replaced with null | Snapshot `example_strip_client_code` shows same null export pattern |
| MODE-06 | Strip exports mode -- specified exports replaced with throw statements | Snapshot `example_strip_exports_used/unused` shows throw pattern |
| MODE-07 | isServer/isBrowser/isDev const replacement | Snapshot `example_build_server` shows isServer=true, isBrowser=false replacement |
</phase_requirements>

## Standard Stack

No new libraries needed for Phase 5. All work uses the existing stack:

| Library | Version | Purpose | Already Installed |
|---------|---------|---------|-------------------|
| magic-string | ^0.30.21 | Surgical source replacement for all transforms | Yes |
| oxc-parser | ^0.124.0 | Parse source to find identifiers for const replacement | Yes |
| oxc-walker | ^0.6.0 | Walk AST for const replacement | Yes |
| vitest | ^4.1.4 | Testing | Yes |

## Architecture Patterns

### Feature Integration Points in Existing Pipeline

The current `transformModule()` in `transform.ts` has a linear pipeline. Phase 5 features integrate at specific points:

```
1. extractSegments()          -- strip_ctx_name affects loc=[0,0] for stripped segments
2. capture analysis           -- strip_ctx_name: stripped segments still report captures  
3. variable migration         -- unchanged
4. rewriteParentModule()      -- entry strategy changes QRL declarations
                              -- dev mode changes qrl() -> qrlDEV()
                              -- strip exports replaces export bodies
                              -- const replacement happens here
5. generateSegmentCode()      -- inline/hoist: no segment files emitted (code goes in parent)
                              -- strip_ctx_name: emit `export const s_HASH = null;` instead
6. segment metadata           -- entry field populated based on strategy
```

### Pattern 1: Entry Strategy -- Smart (Default)

**What:** Each segment gets its own file with `qrl(() => import("./file"), "symbolName")`. This is what the current pipeline already does. The only missing piece is populating the `entry` field in SegmentAnalysis metadata.

**When to use:** `entryStrategy.type === 'smart'` or `entryStrategy.type === 'segment'` or `entryStrategy.type === 'hook'` (all equivalent).

**Snapshot evidence:** Every snapshot tested in Phases 1-4 uses this pattern. `entry: null` in all metadata. [VERIFIED: snapshot corpus]

### Pattern 2: Entry Strategy -- Inline/Hoist

**What:** Instead of emitting separate segment files, all segments are inlined into the parent module using `_noopQrl("symbolName")` declarations and `.s(closureBody)` calls.

**Snapshot evidence from `example_inlined_entry_strategy`:** [VERIFIED: snapshot file]

```typescript
// QRL declarations use _noopQrl instead of qrl(() => import(...))
const q_Child_component_9GyF01GDKqw = /*#__PURE__*/ _noopQrl("Child_component_9GyF01GDKqw");

// Segment bodies attached via .s() calls after declarations
q_Child_component_useStyles_qBZTuFM0160.s('somestring');
q_Child_component_useBrowserVisibleTask_0IGFPOyJmQA.s(()=>{
    const state = _captures[0];
    state.count = thing.doStuff() + import("./sibling");
});

// Component body also attached via .s()
q_Child_component_9GyF01GDKqw.s(()=>{
    useStylesQrl(q_Child_component_useStyles_qBZTuFM0160);
    // ...body...
});

// Final export unchanged
export const Child = /*#__PURE__*/ componentQrl(q_Child_component_9GyF01GDKqw);
```

**Key observations:**
- No separate segment modules emitted at all (only parent module in output)
- `_noopQrl` imported from `@qwik.dev/core` instead of `qrl`
- `.s()` calls appear AFTER all QRL declarations, BEFORE the export
- Captures still work: `.w([state])` on QRL references
- Inner QRL references in `.s()` bodies use the `q_` prefixed variable names
- Ordering: stripped/noop segments first, then other segments, then component body last [ASSUMED]
- `_captures` import still needed for capture unpacking inside `.s()` bodies

### Pattern 3: Dev Mode -- qrlDEV with Metadata

**What:** In `EmitMode::Dev`, `qrl()` calls become `qrlDEV()` with additional dev metadata object.

**Snapshot evidence from `example_dev_mode`:** [VERIFIED: snapshot file]

```typescript
// Instead of: qrl(() => import("./file"), "symbolName")
// Dev mode:
const q_App_component_ckEPmXZlub0 = /*#__PURE__*/ qrlDEV(()=>import("./test.tsx_App_component_ckEPmXZlub0"), "App_component_ckEPmXZlub0", {
    file: "/user/qwik/src/test.tsx",
    lo: 88,
    hi: 200,
    displayName: "test.tsx_App_component"
});
```

**Dev metadata object fields:**
- `file`: Absolute path constructed from srcDir + filename (e.g., `/user/qwik/src/test.tsx`). When `devPath` is provided in input, use that instead.
- `lo`: Start position (from `extraction.loc[0]`)
- `hi`: End position (from `extraction.loc[1]`)
- `displayName`: The extraction's displayName

### Pattern 4: Dev Mode Inline -- _noopQrlDEV

**What:** When both dev mode AND inline/hoist strategy are active, `_noopQrl` becomes `_noopQrlDEV` with dev metadata.

**Snapshot evidence from `example_dev_mode_inlined`:** [VERIFIED: snapshot file]

```typescript
const q_App_component_Cmp_p_q_e_click_Yl4ybrJWrt4 = /*#__PURE__*/ _noopQrlDEV("App_component_Cmp_p_q_e_click_Yl4ybrJWrt4", {
    file: "/user/qwik/src/test.tsx",
    lo: 144,
    hi: 169,
    displayName: "test.tsx_App_component_Cmp_p_q_e_click"
});
```

### Pattern 5: Dev Mode JSX Source Info

**What:** In dev mode, `_jsxSorted()` calls get an additional trailing argument with source location.

**Snapshot evidence from `example_jsx_keyed_dev`:** [VERIFIED: snapshot file]

```typescript
_jsxSorted(Cmp, null, null, null, 3, "stuff", {
    fileName: "project/index.tsx",  // relative path (NOT absolute)
    lineNumber: 7,
    columnNumber: 4
})
```

**Key observations:**
- The source info object is the 8th argument (after key, which is 7th)
- `fileName` uses the relative file path (not absolute, not with srcDir prefix)
- `lineNumber` and `columnNumber` are 1-indexed
- This is already partially handled since JSX transform exists; needs a dev-mode flag to emit this argument

### Pattern 6: Strip Context Names (Server/Client)

**What:** When `stripCtxName` option is set, segments whose `ctxName` starts with any of the strip patterns get replaced with null exports. Their loc is set to `[0, 0]`.

**Snapshot evidence from `example_strip_server_code` (stripCtxName: ["server"]):** [VERIFIED: snapshot file]

```typescript
// Segment output for stripped serverStuff$ call:
export const s_r1qAHX7Opp0 = null;

// Metadata has loc: [0, 0] and captures preserved
// "loc": [0, 0]
```

**From `example_noop_dev_mode` (dev + strip + inline):** [VERIFIED: snapshot file]

```typescript
// Stripped segments with dev mode + inline: _noopQrlDEV with loc [0,0]
const q_qrl_4294901760 = /*#__PURE__*/ _noopQrlDEV("App_component_serverStuff_ebyHaP15ytQ", {
    file: "/hello/from/dev/test.tsx",
    lo: 0,
    hi: 0,
    displayName: "test.tsx_App_component_serverStuff"
});
```

**Key behaviors:**
- Stripped segments emit `export const {symbolName} = null;` as their segment code
- Stripped segments have `loc: [0, 0]` in metadata
- Stripped segments still preserve `captures` and `captureNames` in metadata
- The parent module still references the stripped QRL (it just points to a null export)
- `strip_event_handlers` flag: also strips segments with `ctxKind === "eventHandler"` [VERIFIED: example_strip_client_code has strip_event_handlers=true]

### Pattern 7: Noop QRL Naming Convention

**What:** When segments are stripped (due to stripCtxName), their QRL variable in the parent uses a different naming pattern.

**Snapshot evidence from `example_strip_server_code`:** [VERIFIED: snapshot file]

```typescript
// Normal (non-stripped) QRLs: q_{symbolName}
const q_s_gDH1EtUWqBU = /*#__PURE__*/ qrl(()=>import("./..."), "s_gDH1EtUWqBU");

// Stripped QRLs: q_qrl_{counter} where counter is a specific number
const q_qrl_4294901766 = /*#__PURE__*/ _noopQrl("s_r1qAHX7Opp0");
const q_qrl_4294901768 = /*#__PURE__*/ _noopQrl("s_ddV1irobfWI");
```

The counter pattern `4294901760`, `4294901762`, etc. appears to be `0xFFFF0000 + (index * 2)`. This is a sentinel ID range that cannot conflict with real QRL names. [ASSUMED]

**Note:** In the inline entry strategy snapshots (`example_inlined_entry_strategy`), ALL QRLs use `_noopQrl`, but non-stripped ones use `q_{symbolName}` naming while stripped ones use `q_qrl_{counter}`.

### Pattern 8: Strip Exports

**What:** When `stripExports` option lists export names, those exports have their bodies replaced with a throw statement.

**Snapshot evidence from `example_strip_exports_unused`:** [VERIFIED: snapshot file]

```typescript
// Original: export const onGet = () => { ... mongodb ... };
// Stripped:
export const onGet = ()=>{
    throw "Symbol removed by Qwik Optimizer, it can not be called from current platform";
};
```

**Key behaviors:**
- The export declaration structure is preserved (still `export const name = ...`)
- The body becomes an arrow function that throws a string
- Imports used ONLY by the stripped export are removed (mongodb import removed)
- Imports used by both stripped and non-stripped code are kept
- If a stripped export is referenced by a segment (like `example_strip_exports_used` where `onGet` is used in a segment), the segment gets its own import to the parent module

### Pattern 9: Const Replacement (isServer/isBrowser/isDev)

**What:** When `isServer` option is set, identifiers `isServer` and `isBrowser` (from `@qwik.dev/core` or `@qwik.dev/core/build`) are replaced with boolean literals. Similarly `isDev` based on mode.

**Snapshot evidence from `example_build_server` (mode=prod, isServer=true):** [VERIFIED: snapshot file]

```typescript
// Original: if (isb) { console.log('l', L); ... }
// In parent module (isServer=true, so isBrowser=false):
export const functionThatNeedsWindow = ()=>{};  // body emptied because condition is always false

// In segment: isServer=true, so isServer conditions stay, isBrowser removed
export const s_ckEPmXZlub0 = ()=>{
    useMount$(()=>{
        console.log('server', mongodb());
    });
    return <Cmp>
        {<p>server</p>}
        {false}           // isBrowser replaced with false
    </Cmp>;
};
```

**Replacement rules:**
- `isServer=true`: `isServer` -> `true`, `isBrowser` -> `false`
- `isServer=false`: `isServer` -> `false`, `isBrowser` -> `true`
- `isServer=undefined`: no replacement
- `isDev`: `true` in dev mode, `false` in prod mode [ASSUMED]
- Dead code elimination after const replacement: when `if (false) { ... }` the body is stripped. When `if (true) { ... }` the condition is simplified. [VERIFIED: `functionThatNeedsWindow` body emptied in example_build_server]

**Important:** Const replacement also triggers dead-code simplification in the parent module. If a top-level function's body becomes entirely dead code, it gets replaced with an empty function `()=>{}`. This is a non-trivial optimization.

### Pattern 10: Lib Mode

**What:** `EmitMode::Lib` uses inline strategy with `inlinedQrl()` instead of `_noopQrl()`.

**Snapshot evidence from `example_lib_mode`:** [VERIFIED: snapshot file]

```typescript
export const Works = /*#__PURE__*/ componentQrl(/*#__PURE__*/ inlinedQrl((props)=>{
    useStyleQrl(/*#__PURE__*/ inlinedQrl(STYLES, "Works_component_useStyle_i40UL9JyQpg"));
    // ...nested inlinedQrl calls...
}, "Works_component_t45qL4vNGv0"));
```

**Key differences from inline/hoist:**
- Uses `inlinedQrl(body, "symbolName", [captures])` not `_noopQrl("name").s(body)`
- QRLs are nested inline within the call site (not hoisted to module scope)
- Capture arrays passed as 3rd argument to `inlinedQrl()`
- No separate `.s()` calls
- No separate segment files

### Pattern 11: Parsed Inlined QRLs (Pre-existing inlinedQrl in input)

**What:** When the INPUT already contains `inlinedQrl()` calls (pre-compiled code), the optimizer re-processes them using the inline/hoist strategy.

**Snapshot evidence from `example_parsed_inlined_qrls`:** [VERIFIED: snapshot file]

The optimizer detects existing `inlinedQrl()` in input and converts them to `_noopQrl().s()` pattern (inline strategy) or keeps them as `inlinedQrl()` (lib mode).

### Anti-Patterns to Avoid

- **Modifying extraction for entry strategies:** Entry strategies should NOT change how segments are extracted. They only change how QRL references and segment modules are emitted.
- **Coupling strip logic with extraction:** Strip decisions should be made AFTER extraction, not during. The extraction still happens; the output is just replaced with null.
- **Dead code elimination in segments:** Only const replacement in the parent module triggers dead code. Segments don't get dead code elimination -- that's downstream (bundler).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line/column from offset | Manual string scanning | oxc-parser loc info from AST nodes | Parser already computes line/column |
| Dead code after const replacement | Full DCE pass | Simple if(false)/if(true) branch elimination | Only need trivial cases; bundler handles complex DCE |

## Common Pitfalls

### Pitfall 1: _noopQrl Naming for Stripped vs Inline Segments
**What goes wrong:** Using the same naming convention for stripped segments (which use sentinel counter IDs like `q_qrl_4294901760`) and non-stripped inline segments (which use `q_{symbolName}`).
**Why it happens:** Both use `_noopQrl` but different variable naming.
**How to avoid:** Track whether a segment is stripped vs merely inlined. Stripped -> sentinel counter name. Inlined -> symbol name.
**Warning signs:** Snapshot comparison fails on QRL variable names.

### Pitfall 2: Dev Mode File Path Construction
**What goes wrong:** Using wrong path format for the `file` field in dev metadata. Some snapshots use absolute paths from `srcDir`, others use `devPath`.
**Why it happens:** The `file` field uses `devPath` if provided (in `TransformModuleInput`), otherwise constructs from `srcDir + "/" + path`.
**How to avoid:** Check `input.devPath` first, fall back to constructed path.
**Warning signs:** Dev mode snapshots fail on `file` field mismatch.

### Pitfall 3: JSX Dev Source Info Uses Relative Path
**What goes wrong:** Using absolute path for `fileName` in JSX dev source info.
**Why it happens:** The JSX dev info `fileName` is the relative file path (e.g., `"project/index.tsx"`) NOT the absolute `file` path used in qrlDEV metadata.
**How to avoid:** Use the relPath (relative to srcDir) for JSX fileName, use absolute/devPath for qrlDEV file.
**Warning signs:** JSX source info snapshots fail.

### Pitfall 4: Strip Exports Removes Unused Imports
**What goes wrong:** Keeping imports that were only used by stripped exports.
**Why it happens:** After replacing an export body with a throw statement, the imports it referenced become dead.
**How to avoid:** After strip exports replacement, scan remaining code for import usage and remove unused imports.
**Warning signs:** Extra imports in parent module output.

### Pitfall 5: Const Replacement Requires Import-Awareness
**What goes wrong:** Replacing ALL identifiers named `isServer` when only the one imported from `@qwik.dev/core/build` should be replaced.
**Why it happens:** `isServer` might be a user-defined variable in inner scope.
**How to avoid:** Only replace identifiers that trace back to a `@qwik.dev/core` or `@qwik.dev/core/build` import. Use the import map from `collectImports()`.
**Warning signs:** User variables incorrectly replaced.

### Pitfall 6: Inline Strategy Order Matters
**What goes wrong:** `.s()` calls referencing QRL variables that haven't been declared yet.
**Why it happens:** Wrong ordering of QRL declarations and `.s()` calls.
**How to avoid:** All `_noopQrl` declarations FIRST, then `.s()` calls, then exports.
**Warning signs:** Runtime errors about undefined variables.

## Code Examples

### QRL Declaration for Dev Mode
```typescript
// Source: [VERIFIED: example_dev_mode snapshot]
function buildQrlDevDeclaration(
  symbolName: string,
  canonicalFilename: string,
  devFile: string,
  lo: number,
  hi: number,
  displayName: string,
): string {
  return `const q_${symbolName} = /*#__PURE__*/ qrlDEV(()=>import("./${canonicalFilename}"), "${symbolName}", {\n` +
    `    file: "${devFile}",\n` +
    `    lo: ${lo},\n` +
    `    hi: ${hi},\n` +
    `    displayName: "${displayName}"\n` +
    `});`;
}
```

### Noop QRL for Inline Strategy
```typescript
// Source: [VERIFIED: example_inlined_entry_strategy snapshot]
function buildNoopQrlDeclaration(symbolName: string): string {
  return `const q_${symbolName} = /*#__PURE__*/ _noopQrl("${symbolName}");`;
}
```

### Noop QRL for Stripped Segments (Sentinel Counter)
```typescript
// Source: [VERIFIED: example_strip_server_code snapshot]
// Counter starts at 0xFFFF0000 (4294901760) and increments by 2
function buildStrippedNoopQrl(symbolName: string, counter: number): string {
  return `const q_qrl_${counter} = /*#__PURE__*/ _noopQrl("${symbolName}");`;
}
```

### Strip Exports Replacement
```typescript
// Source: [VERIFIED: example_strip_exports_unused snapshot]
// Replace: export const onGet = () => { ...complex body... };
// With:    export const onGet = ()=>{\n    throw "Symbol removed by Qwik Optimizer, it can not be called from current platform";\n};
```

### Inline .s() Call
```typescript
// Source: [VERIFIED: example_inlined_entry_strategy snapshot]
// After QRL declarations, attach segment bodies:
// q_{symbolName}.s({bodyText});
// For captures: q_{symbolName}.s(() => { const x = _captures[0]; ... });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `qrl()` only | `qrl()` + `qrlDEV()` + `_noopQrl()` + `_noopQrlDEV()` + `inlinedQrl()` | Qwik v2 | 5 QRL generation variants based on mode + strategy |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Sentinel counter for stripped noop QRLs starts at 0xFFFF0000 and increments by 2 | Pattern 7 | Variable names won't match snapshots |
| A2 | isDev replacement: true in dev mode, false in prod mode | Pattern 9 | Incorrect boolean substitution |
| A3 | Inline strategy orders: stripped segments first, then non-stripped, then component body last | Pattern 2 | Ordering mismatch in output |
| A4 | MODE-03 (_useHmr injection) behavior not observed in available snapshots | Phase Requirements | May need to examine Qwik Vite plugin source to understand trigger conditions |
| A5 | Dead code elimination after const replacement is limited to simple if(false)/if(true) branch removal | Pattern 9 | May need more sophisticated DCE for edge cases |

## Open Questions

1. **_useHmr Injection (MODE-03)**
   - What we know: The requirement mentions `_useHmr(filePath)` injection in component segments during dev mode
   - What's unclear: No snapshot in the corpus demonstrates this behavior explicitly. It may be a Vite plugin concern rather than an optimizer concern.
   - Recommendation: Check Qwik Vite plugin source for HMR handling. If it's injected by the Vite plugin (not the optimizer), this requirement may be out of scope.

2. **Dead Code Elimination Depth**
   - What we know: `example_build_server` shows `functionThatNeedsWindow` body emptied after const replacement
   - What's unclear: How deep the DCE goes -- just top-level if(false) or also nested?
   - Recommendation: Implement simple top-level if(false) branch removal first, expand if snapshots require it.

3. **Component and Single Entry Strategies**
   - What we know: Types exist for `component` and `single` strategies
   - What's unclear: No dedicated snapshots found for these strategies. They primarily affect the `entry` field in metadata (which is currently always `null`).
   - Recommendation: Implement by setting `entry` field based on strategy type; validate against any corpus snapshots that use non-null `entry`.

4. **Sentinel Counter Origin**
   - What we know: Numbers like 4294901760, 4294901762, 4294901764 appear in stripped QRL variable names
   - What's unclear: Exact algorithm (0xFFFF0000 + 2*index seems right but not confirmed)
   - Recommendation: Verify by checking multiple stripped snapshots for counter pattern consistency

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENT-01 | Smart mode sets entry metadata | unit | `npx vitest run tests/optimizer/transform.test.ts -x` | Wave 0 |
| ENT-02 | Inline/hoist _noopQrl + .s() pattern | snapshot | `npx vitest run tests/optimizer/snapshot-batch.test.ts -x` | Extend existing |
| ENT-03 | Component entry strategy grouping | unit | `npx vitest run tests/optimizer/transform.test.ts -x` | Wave 0 |
| ENT-04 | Manual chunks custom grouping | unit | `npx vitest run tests/optimizer/transform.test.ts -x` | Wave 0 |
| MODE-01 | Dev mode qrlDEV with metadata | snapshot | `npx vitest run tests/optimizer/snapshot-batch.test.ts -x` | Extend existing |
| MODE-02 | Dev JSX source info | snapshot | `npx vitest run tests/optimizer/snapshot-batch.test.ts -x` | Extend existing |
| MODE-03 | HMR injection | unit | `npx vitest run tests/optimizer/transform.test.ts -x` | Wave 0 |
| MODE-04 | Server strip mode | snapshot | `npx vitest run tests/optimizer/snapshot-batch.test.ts -x` | Extend existing |
| MODE-05 | Client strip mode | snapshot | `npx vitest run tests/optimizer/snapshot-batch.test.ts -x` | Extend existing |
| MODE-06 | Strip exports mode | snapshot | `npx vitest run tests/optimizer/snapshot-batch.test.ts -x` | Extend existing |
| MODE-07 | isServer/isBrowser/isDev const replacement | snapshot | `npx vitest run tests/optimizer/snapshot-batch.test.ts -x` | Extend existing |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green (381+ tests) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Add entry strategy unit tests in `tests/optimizer/transform.test.ts`
- [ ] Add snapshot batch entries for dev mode, inline, strip snapshots in `snapshot-batch.test.ts`

## Security Domain

Not applicable -- this phase involves code transformation logic only, no authentication, network, or user input handling. The optimizer processes trusted source code from the development environment.

## Sources

### Primary (HIGH confidence)
- Snapshot file `example_dev_mode.snap` -- qrlDEV call signature and dev metadata format
- Snapshot file `example_dev_mode_inlined.snap` -- _noopQrlDEV pattern
- Snapshot file `example_inlined_entry_strategy.snap` -- _noopQrl + .s() inline pattern
- Snapshot file `example_strip_server_code.snap` -- server strip with null exports, sentinel naming
- Snapshot file `example_strip_client_code.snap` -- client strip with strip_event_handlers
- Snapshot file `example_strip_exports_unused.snap` -- throw statement replacement
- Snapshot file `example_strip_exports_used.snap` -- throw + segment import to parent
- Snapshot file `example_build_server.snap` -- const replacement and dead code
- Snapshot file `example_noop_dev_mode.snap` -- combined dev + strip + inline patterns
- Snapshot file `example_jsx_keyed_dev.snap` -- JSX dev source info format
- Snapshot file `example_lib_mode.snap` -- lib mode inlinedQrl pattern
- Snapshot file `example_parsed_inlined_qrls.snap` -- pre-existing inlinedQrl processing
- Snapshot file `example_qwik_react_inline.snap` -- inline strategy with complex captures
- Qwik optimizer test.rs (via WebFetch) -- test configurations for each snapshot

### Secondary (MEDIUM confidence)
- Qwik optimizer transform.rs (via WebFetch) -- entry strategy determination logic

### Tertiary (LOW confidence)
- _useHmr behavior not found in snapshots -- needs further investigation

## Metadata

**Confidence breakdown:**
- Entry strategies: HIGH -- snapshot evidence for smart, inline, hoist; lib mode shown
- Dev mode: HIGH -- multiple snapshots showing qrlDEV, _noopQrlDEV, JSX source info
- Strip modes: HIGH -- server/client/export strip all shown in snapshots
- Const replacement: HIGH -- example_build_server shows the pattern
- HMR injection: LOW -- not demonstrated in available snapshots
- Component/single strategies: MEDIUM -- types exist, but limited snapshot evidence

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable domain, Qwik v2 optimizer spec unlikely to change)
