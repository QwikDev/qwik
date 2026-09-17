# Absorb the five legacy modules the pipeline still imports
Type: grilling
Status: resolved
Blocked by:

## Question

`pipeline/` imports five modules from legacy `src/`: `expr-ir` (the whole `ValueIR` vocabulary
the schema is typed against, 18 sites), `normalization` (`createOriginalRangeMapper`),
`module-assembly` (`assembleModule`, `assembleGeneratedModule`), `emit-qrl`
(`applyReplacements`), `source-location` (`createSourceLocation`, compat only).

Decide for each: where it lives inside `pipeline/` (schema vs generate vs a shared root file),
whether it moves as-is or is reshaped at move time (e.g. does `ValueIR` gain the
`build-constant` leaf now, does `TExtension` stay), and whether the legacy names survive.
Output: a move table (old path → new path, verbatim or reshaped, tests that pin it).

## Answer

Resolved 2026-09-17 (Varixo accepted the recommended answers).

| legacy `src/` | pipeline home | shape |
| --- | --- | --- |
| `expr-ir.ts` (`ValueIR`, `ValueIrKind`, `LambdaIR`, `*ArgIR`, `collectIrBindingIds`) | `pipeline/schema/value-ir.ts` | reshaped: `BindingId` → `LocalId`; drop the never-produced variants `Call`, `DefCall`, `PluginCall`, `LambdaIR`, `FnArgIR`, `QrlArgIR`, `RenderArgIR`; keep `TExtension`; no `build-constant` leaf (delete the stale NOTE in `schema/value.ts`) |
| `normalization.ts` `createOriginalRangeMapper`, `createNodeSourceMap` | `pipeline/source-maps.ts` (phase-neutral root file) | verbatim |
| `module-assembly.ts` `assembleModule`, `assembleGeneratedModule`, `composeMaps` | folded into `pipeline/generate/assemble-module.ts` | verbatim |
| `emit-qrl.ts` `applyReplacements` | private helper in `pipeline/generate/emit-chunk.ts` (moves with the printer if ticket 12 splits it) | verbatim |
| `source-location.ts` `createSourceLocation` | inlined in `pipeline/transform-modules.ts` | verbatim |
| `compat/transform-modules.ts` | renamed `pipeline/transform-modules.ts` — the per-module host entry the vite plugin calls after cutover | rename only |

Pins: the 434 snapshots byte-unchanged, `source-maps.unit.ts`, `schema.unit.ts` round trip. Guardrail: eslint
`no-restricted-imports` forbidding `../src` (any depth) from `pipeline/**`. Legacy keeps its own copies until the
cutover commit deletes them. The call/plugin IR shape for server holes is ticket 07's decision.
