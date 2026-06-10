/**
 * API types for the Qwik optimizer.
 *
 * These types define the public interface for transformModule() and related
 * functions. They must match the NAPI binding interface exactly so the
 * TypeScript optimizer is a drop-in replacement for the SWC optimizer.
 *
 * Source: Qwik optimizer types.ts (verified from GitHub + research)
 */

import type { AstEcmaScriptModule, AstProgram } from '../../ast-types.js';

import type {
  ByteOffset,
  CanonicalFilename,
  ColumnNumber,
  CtxName,
  DisplayName,
  FilePath,
  Hash,
  LineNumber,
  Origin,
  RelativePath,
  SourceText,
  SymbolName,
} from './brands.js';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Options for the `transformModule` batch transform (Qwik optimizer entry).
 *
 * Shape matches the historical SWC/NAPI binding so callers can swap implementations.
 * Some fields exist for that contract but are not read yet by this TypeScript
 * optimizer (see each property).
 */
// `TransformModulesOptions` is the user-supplied input contract. All
// fields readonly: the optimizer reads but never mutates options.
export interface TransformModulesOptions {
  /** Source modules to transform (path + source per file). */
  readonly input: readonly TransformModuleInput[];

  /**
   * Absolute path to the application source root. Used with each input's
   * `path` to compute module-relative paths (e.g. for outputs and diagnostics).
   */
  readonly srcDir: FilePath;

  /**
   * Optional project root for path normalization in the full Qwik toolchain.
   * **Not used** by this implementation today; kept for NAPI parity.
   */
  readonly rootDir?: string;

  /**
   * How lazy boundaries / QRL entry chunks are laid out (`inline`, `hoist`,
   * `hook`, `segment`, etc.).
   * @defaultValue `{ type: 'smart' }`
   */
  readonly entryStrategy?: EntryStrategy;

  /**
   * Post-transform simplification level for emitted parent code.
   * Passed through to the parent-module rewrite step.
   */
  readonly minify?: MinifyMode;

  /**
   * Whether to emit source maps. **Not wired** in this implementation yet
   * (output `map` fields are currently `null`); kept for NAPI parity.
   */
  readonly sourceMaps?: boolean;

  /**
   * When `true`, strip TypeScript syntax (and related optimizer behavior such
   * as enum handling). When omitted or `false`, TypeScript is preserved except
   * where JSX transpilation implies extension changes.
   */
  readonly transpileTs?: boolean;

  /**
   * When `false`, skip JSX→JS transform and signal-aware JSX handling.
   * When omitted or `undefined`, JSX transpilation is **enabled** (matches
   * historical default-on behavior).
   */
  readonly transpileJsx?: boolean;

  /**
   * Preserve original filenames in emitted artifact paths/metadata where the
   * Rust optimizer does. **Not used** by this implementation yet; NAPI parity.
   */
  readonly preserveFilenames?: boolean;

  /**
   * When `true`, relative imports to the parent module include explicit file
   * extensions (e.g. `./foo.js` vs `./foo`).
   */
  readonly explicitExtensions?: boolean;

  /**
   * Build flavor: affects prod symbol hashing (`prod`), dev paths (`dev`/`hmr`),
   * library emit (`lib`), etc.
   * @defaultValue `'prod'`
   */
  readonly mode?: EmitMode;

  /**
   * Optional scope string folded into QRL hashing / extraction disambiguation
   * (same role as in the upstream optimizer).
   */
  readonly scope?: string;

  /**
   * Export names to strip from the rewritten parent module (client/server split).
   */
  readonly stripExports?: readonly string[];

  /**
   * Context-name patterns used when registering or rewriting stripped regions
   * (passed to parent rewrite / codegen when applicable).
   */
  readonly regCtxName?: readonly string[];

  /** Context names to strip in emitted parent code when strip rules apply. */
  readonly stripCtxName?: readonly string[];

  /** Strip JSX event props/handlers when building server-only or stripped graphs. */
  readonly stripEventHandlers?: boolean;

  /**
   * Server build: drives constant substitution (e.g. `import.meta` / env-like
   * replacements) during parent rewrite.
   */
  readonly isServer?: boolean;
}

/**
 * One source file passed to `transformModule`. The optimizer transforms each
 * input independently into a parent module plus zero-or-more segment modules.
 */
export interface TransformModuleInput {
  /**
   * Module path used for both naming (folded into hash + display name) and
   * relative-import emission. Should be relative to `srcDir`.
   */
  readonly path: FilePath;

  /** Raw source text. */
  readonly code: SourceText;

  /**
   * Optional dev-mode path used by `qrlDEV`/`useHmr` injection when emitting
   * dev or HMR builds. Falls back to a derived path when omitted.
   */
  readonly devPath?: string;

  /**
   * Optional pre-parsed Program for this input. When supplied, the
   * optimizer skips its internal parse and uses this AST directly —
   * meaningful perf for bundler integrations where the host already
   * parsed the source (e.g. Rolldown's `meta.ast` from the `transform`
   * hook).
   *
   * The contract is structural: any ESTree/TS-ESTree-compatible Program
   * that satisfies the type at runtime works. The type alias originates
   * from `@oxc-project/types` because OXC is the optimizer's internal
   * parser; ESTree-compatible parsers like Yuku that produce
   * structurally-matching ASTs satisfy the same shape.
   *
   * Skipping the parse is opt-in: omit this field and the optimizer
   * parses internally as before. Caller is responsible for ensuring the
   * AST matches `code` — the optimizer trusts the input without
   * re-validating.
   */
  readonly program?: AstProgram;

  /**
   * Optional ESM-module metadata sibling to `program`. Some optimizer
   * passes (export tracking, import classification) read module-level
   * info that OXC exposes alongside the Program. When `program` is
   * supplied with a matching `module`, both flow through; when `module`
   * is omitted but `program` is supplied, downstream passes either
   * derive what they need from the Program directly or fall back to
   * `undefined` where the field is optional.
   */
  readonly module?: AstEcmaScriptModule;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/**
 * Result of a `transformModule` invocation across one or more inputs.
 *
 * Each input contributes a parent module plus its segment modules to
 * `modules`; diagnostics are aggregated into a single flat list.
 */
// `TransformOutput` is the public NAPI output contract. All fields are
// readonly: the optimizer constructs the result and hands it to the
// consumer; downstream code should treat it as immutable. (Builder
// orchestrators internally accumulate the `modules` / `diagnostics`
// arrays before constructing the output; that mutation happens in
// the orchestrator's local scope, not via this interface.)
export interface TransformOutput {
  /**
   * All emitted modules in dependency-friendly order: rewritten parent
   * modules and their extracted segment modules.
   */
  readonly modules: readonly TransformModule[];

  /** Errors and warnings collected during transform (`diagnostics.ts`). */
  readonly diagnostics: readonly Diagnostic[];

  /**
   * `true` if any input was a `.ts` or `.tsx` file. Hint flag for the build
   * pipeline so it can decide whether downstream tooling needs to handle TS.
   */
  readonly isTypeScript: boolean;

  /**
   * `true` if any input was a `.tsx` or `.jsx` file. Hint flag for the build
   * pipeline so it can decide whether downstream tooling needs to handle JSX.
   */
  readonly isJsx: boolean;
}

/**
 * One emitted module — either a rewritten parent (the original file's
 * QRL-referenced shell) or an extracted segment (a single `$()` body lifted
 * into its own lazy-loadable file).
 *
 * Discriminated on `kind`. Internal code narrows via
 * `module.kind === 'segment'` (or via the equivalent `module.isEntry`
 * boolean); the discriminator gates access to variant-specific fields
 * (`segment` on segment modules, `origPath` on parent modules) at compile
 * time. The null-arm fields (`segment: null` on parents, `origPath: null`
 * on segments) were dropped once all consumers narrowed via `kind`.
 */
export type TransformModule = TransformModuleParent | TransformModuleSegment;

/** Rewritten parent module — the original file's QRL-referenced shell. */
export interface TransformModuleParent {
  readonly kind: 'parent';

  /** Output path for this module, relative to `srcDir` — the original input path. */
  readonly path: RelativePath;

  /** Parents are never lazy-load entry points. */
  readonly isEntry: false;

  /** Emitted source code. */
  readonly code: string;

  /**
   * Source map text. **Not wired** in this implementation today (always
   * `null`); kept for NAPI parity. Source map emission is gated by
   * `TransformModulesOptions.sourceMaps`.
   */
  readonly map: string | null;

  /**
   * Original input file path (preserves the source from
   * `TransformModuleInput.path`).
   */
  readonly origPath: string;
}

/** Extracted segment module — a single `$()` body lifted into its own lazy-loadable file. */
export interface TransformModuleSegment {
  readonly kind: 'segment';

  /**
   * Output path for this module, relative to `srcDir` —
   * `<canonicalFilename>.<extension>`.
   */
  readonly path: RelativePath;

  /** Segments are always lazy-load entry points resolved via `qrl(() => import(...))`. */
  readonly isEntry: true;

  /** Emitted source code. Empty string for inline-strategy segments. */
  readonly code: string;

  /**
   * Source map text. **Not wired** in this implementation today (always
   * `null`); kept for NAPI parity. Source map emission is gated by
   * `TransformModulesOptions.sourceMaps`.
   */
  readonly map: string | null;

  /**
   * Segment metadata. The runtime uses this to wire `qrl(...)` references to the
   * correct file.
   */
  readonly segment: SegmentAnalysis;
}

// ---------------------------------------------------------------------------
// Segment analysis
// ---------------------------------------------------------------------------

/**
 * Per-segment metadata emitted alongside each extracted segment module.
 *
 * Field semantics, computation, and how each name is composed live in
 * `.claude/rules/OPTIMIZER.md` ("Symbol naming and hashing"). Snapshot
 * comparisons in `tests/optimizer/convergence.test.ts` strict-equality
 * compare a subset of these fields against `match-these-snaps/`.
 */
// `SegmentAnalysis` is the public NAPI output type: it's constructed once
// per segment at the end of Phase 5 segment generation (after all
// Phase 4-5 mutations on `ExtractionResult` have settled) and handed to
// the runtime / external consumers read-only. All fields are `readonly`.
export interface SegmentAnalysis {
  /** Source file the segment was extracted from (e.g. `"test.tsx"`). */
  readonly origin: Origin;

  /**
   * Canonical symbol name — `<contextPortion>_<hash>` (or `s_<hash>` after
   * the prod-mode rename). Used as the segment file's exported binding name
   * and as the `qrl(...)` second argument.
   */
  readonly name: SymbolName;

  /**
   * Entry-strategy routing field. Resolved during Phase 5 segment generation
   * (`entry-strategy.ts:resolveEntryField`). `null` for `smart`/`segment`/
   * `hook`/`inline`/`hoist`; parent symbol name for `component`'s
   * non-component children; fixed `"entry_hooks"` for `single`.
   */
  readonly entry: string | null;

  /** Human-readable name — `<fileStem>_<contextPortion>`, no hash suffix. */
  readonly displayName: DisplayName;

  /**
   * 11-char SipHash-1-3 of `(scope + relPath + contextPortion)`,
   * base64url-encoded with `-` and `_` rewritten to `0` for filesystem
   * safety. Stable across builds.
   */
  readonly hash: Hash;

  /**
   * `<displayName>_<hash>` — basis for the segment file path on disk.
   */
  readonly canonicalFilename: CanonicalFilename;

  /**
   * File extension for the segment module (e.g. `"tsx"`, `"jsx"`, `"js"`).
   * Determined from the source extension and JSX/TS transpilation settings.
   */
  readonly extension: string;

  /**
   * Symbol name of the enclosing extraction for nested segments; `null` for
   * top-level extractions. Resolved during parent rewrite, not at extract
   * time (`rewrite/index.ts:resolveNesting`).
   */
  readonly parent: SymbolName | null;

  /**
   * Where the `$()` was found:
   * - `'function'` — bare callable (`useTask$`, `component$`, etc.)
   * - `'eventHandler'` — `on*$` / `document:on*$` / `window:on*$` on an HTML element
   * - `'jSXProp'` — any `*$` attribute on a component element
   */
  readonly ctxKind: 'eventHandler' | 'function' | 'jSXProp';

  /**
   * The `$`-marker name (`'component$'`, `'useTask$'`, etc.) for `function`
   * ctxKind, or the JSX attribute name for handler/prop ctxKinds. Drives
   * strip rules, HMR injection, and per-marker special-cases downstream.
   */
  readonly ctxName: CtxName;

  /**
   * `true` iff this segment closes over any outer-scope binding —
   * derived from `captureNames.length > 0` at extraction time, so it can
   * temporarily diverge from `captureNames` during downstream filtering
   * (props consolidation, const inline, migration).
   */
  readonly captures: boolean;

  /**
   * Source-byte range `[start, end]` of the segment's body in the original
   * source. Used by source map emission and migration source-range surgery.
   */
  readonly loc: readonly [ByteOffset, ByteOffset];
}

/**
 * Internal metadata extending `SegmentAnalysis` with optional fields used for
 * snapshot comparison compatibility.
 *
 * `paramNames` and `captureNames` appear in `match-these-snaps/` metadata
 * blocks but are not part of the public API type. They're populated by
 * capture analysis (`capture-analysis.ts`) and threaded through Phase 5
 * codegen for `_captures` unpacking and signature rewrites.
 */
export interface SegmentMetadataInternal extends SegmentAnalysis {
  /**
   * Closure parameter names. Used by `rewriteFunctionSignature` for
   * loop-padding (`_,_1,...`) cases and by codegen to rename destructured
   * props to `_rawProps`.
   *
   * Snapshotted from `ExtractionResult.paramNames` after Phase 4-5
   * mutations have settled; readonly at the SegmentMetadataInternal layer.
   */
  readonly paramNames?: readonly string[];

  /**
   * List of captured outer-scope names. Mutated during Phase 4–5 on
   * `ExtractionResult.captureNames` (props consolidation can replace
   * destructured prop names with `_rawProps`, const-literal inlining
   * drops folded names, migration filtering drops names that became
   * `_auto_` imports). The snapshot here is taken after those settle.
   */
  readonly captureNames?: readonly string[];
}

// ---------------------------------------------------------------------------
// Strategy and mode types
// ---------------------------------------------------------------------------

/**
 * Mixin shape for the `EntryStrategy` variants that accept a per-symbol
 * manual override map. Extracted so the 5 manual-bearing variants
 * declare the relationship once instead of duplicating `manual?:` five
 * times.
 *
 * Consulted by `entry-strategy.ts:resolveEntryField` and unpacked at the
 * use site via the {@link hasManualEntryMap} predicate.
 *
 * Note: `inline` and `hoist` are intentionally NOT extended with this mixin
 * — those strategies emit segment bodies *inside* the parent module (so there's
 * no per-segment file path to override), and the type system rejects
 * `{ type: 'inline', manual: ... }` accordingly.
 */
export interface WithManualEntryMap {
  /**
   * Per-symbol override of the resolved entry chunk name. Keys are
   * `SymbolName`s; values are the chunk name the runtime should fetch from.
   */
  readonly manual?: Record<string, string>;
}

/**
 * How the optimizer lays out lazy-load boundaries / QRL entry chunks.
 *
 * Affects whether segments emit as separate files (`smart`/`segment`/`hook`)
 * or stay inlined into the parent via `inlinedQrl` / `_noopQrl().s(body)`
 * (`inline`/`hoist`/`lib`-style flows).
 *
 * The 5 variants that emit separate files accept a per-symbol manual
 * override via {@link WithManualEntryMap}. The 2 inline-mode variants
 * (`inline`/`hoist`) don't — `manual` is not a meaningful concept when
 * segments stay in the parent.
 */
export type EntryStrategy =
  /** Each segment stays inline in the parent via `inlinedQrl(body, name)`. */
  | { type: 'inline' }
  /** Segment bodies hoist to module scope but stay in the parent file. */
  | { type: 'hoist' }
  /** Per-segment files keyed by hook (manual override map allowed). */
  | (WithManualEntryMap & { type: 'hook' })
  /** Per-segment files keyed by extracted symbol (manual override allowed). */
  | (WithManualEntryMap & { type: 'segment' })
  /** Bundle every segment into a single file named `entry_hooks`. */
  | (WithManualEntryMap & { type: 'single' })
  /** Group segments by enclosing component$; non-component children point at parent. */
  | (WithManualEntryMap & { type: 'component' })
  /** Default heuristic blend; one segment per extraction. */
  | (WithManualEntryMap & { type: 'smart' });

/**
 * Type predicate narrowing an `EntryStrategy` to the variants that carry a
 * {@link WithManualEntryMap} mixin. Use instead of a `as Exclude<...>` cast
 * at narrowing sites — per the CBP rule "Casts are reserved for two
 * narrow purposes" (brand constructors + validated FFI).
 */
export function hasManualEntryMap(
  s: EntryStrategy,
): s is EntryStrategy & WithManualEntryMap {
  return s.type !== 'inline' && s.type !== 'hoist';
}

/**
 * Post-transform parent-module simplification level.
 * - `'simplify'` (default): remove unused bindings, dedupe exports, drop
 *   redundant imports — see `rewrite/index.ts` cleanup passes.
 * - `'none'`: skip simplification passes; preserves more of the original
 *   structure (used for debugging or library emit where downstream tooling
 *   handles minification).
 */
export type MinifyMode = 'simplify' | 'none';

/**
 * Build flavor for the emit pipeline.
 * - `'prod'` (default): symbol names get rewritten to short `s_<hash>` form,
 *   no dev-only metadata.
 * - `'dev'`: preserves long symbol names, emits `qrlDEV(...)` with
 *   `{ file, lo, hi, displayName }` metadata for source-mapped tooling.
 * - `'hmr'`: like `dev` plus `useHmr(devFile)` injection on `component$`
 *   segments (`postProcessSegmentCode`).
 * - `'lib'`: library-emit flavor; bodies inline as `inlinedQrl(body, name)`
 *   in a single-module output for library publishing (no segment files).
 *   Mirrors SWC's `EmitMode::Lib`.
 * - `'test'`: test-fixture flavor; no special handling (no prod-rename,
 *   no dev-file paths, no lib emit). Used as the SWC `EmitMode::Test`
 *   default; TS tests should use this for non-mode-sensitive fixtures
 *   so the lib-emit trigger only fires when explicitly requested.
 */
export type EmitMode = 'dev' | 'prod' | 'lib' | 'hmr' | 'test';

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * A flat source-range descriptor attached to diagnostic messages.
 *
 * Carries both byte offsets (`lo`/`hi`, for source-map and AST-range work)
 * and 1-based line/column pairs (for human-readable IDE display). The
 * "Flat" suffix distinguishes this from any nested-highlight shape used
 * upstream.
 */
export interface DiagnosticHighlightFlat {
  /** Inclusive byte offset of the start of the highlighted span. */
  readonly lo: ByteOffset;
  /** Exclusive byte offset of the end of the highlighted span. */
  readonly hi: ByteOffset;
  /** 1-based line number where the span starts. */
  readonly startLine: LineNumber;
  /** 0-based column on `startLine` where the span starts. */
  readonly startCol: ColumnNumber;
  /** 1-based line number where the span ends. */
  readonly endLine: LineNumber;
  /** 0-based column on `endLine` where the span ends. */
  readonly endCol: ColumnNumber;
}

/**
 * One error or warning surfaced by the optimizer. Constructed via the
 * helpers in `diagnostics.ts` (e.g. `emitC02`, `emitC05`,
 * `emitPassiveConflictWarning`); collected into `TransformOutput.diagnostics`.
 *
 * Suppressible from source via `// @qwik-disable-next-line <code>` directives
 * (parsed by `parseDisableDirectives` in `diagnostics.ts`).
 */
export interface Diagnostic {
  /** Severity. `'error'` blocks; `'warning'` is informational. */
  readonly category: 'error' | 'warning';

  /**
   * Stable diagnostic identifier (e.g. `'C02'` for cross-boundary local
   * function reference, `'C05'` for missing `Qrl` export, `'preventdefault-passive-check'`
   * for the passive-event prop conflict).
   */
  readonly code: string;

  /** Source file the diagnostic refers to (relative path). */
  readonly file: string;

  /** Human-readable message. */
  readonly message: string;

  /**
   * Source-range highlights. `null` when the diagnostic doesn't pin to a
   * specific location.
   */
  readonly highlights: readonly DiagnosticHighlightFlat[] | null;

  /**
   * Suggested fixes. **Not wired** in this implementation today (always
   * `null`); kept for NAPI parity.
   */
  readonly suggestions: null;

  /** Origin scope, always `'optimizer'` for diagnostics emitted from this module. */
  readonly scope: string;
}
