/**
 * API types for the Qwik optimizer — the public interface for
 * `transformModule` and related functions. The shape is a fixed compatibility
 * contract, so some fields exist for that contract without being read yet
 * (noted at the type level).
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

/**
 * Options for the `transformModule` batch transform. Some fields are accepted
 * for API compatibility but not yet read by this optimizer (`rootDir`,
 * `sourceMaps`, `preserveFilenames`). Defaults: `entryStrategy` smart,
 * `minify` simplify, `mode` prod, `transpileJsx` on.
 */
export interface TransformModulesOptions {
  readonly input: readonly TransformModuleInput[];

  readonly srcDir: FilePath;

  readonly rootDir?: string;

  readonly entryStrategy?: EntryStrategy;

  readonly minify?: MinifyMode;

  readonly sourceMaps?: boolean;

  readonly transpileTs?: boolean;

  readonly transpileJsx?: boolean;

  readonly preserveFilenames?: boolean;

  readonly explicitExtensions?: boolean;

  readonly mode?: EmitMode;

  readonly scope?: string;

  readonly stripExports?: readonly string[];

  readonly regCtxName?: readonly string[];

  readonly stripCtxName?: readonly string[];

  readonly stripEventHandlers?: boolean;

  readonly isServer?: boolean;
}

/**
 * One source file passed to `transformModule` (transformed independently into
 * a parent module plus zero-or-more segment modules). When `program` (and its
 * optional sibling `module`) is supplied, the optimizer skips its internal
 * parse and trusts the AST without re-validating it against `code`.
 */
export interface TransformModuleInput {
  readonly path: FilePath;

  readonly code: SourceText;

  readonly devPath?: string;

  readonly program?: AstProgram;

  readonly module?: AstEcmaScriptModule;
}

/**
 * Result of a `transformModule` invocation: rewritten parent modules and their
 * extracted segment modules (in dependency-friendly order) plus a flat
 * diagnostics list.
 */
export interface TransformOutput {
  readonly modules: readonly TransformModule[];

  readonly diagnostics: readonly Diagnostic[];

  readonly isTypeScript: boolean;

  readonly isJsx: boolean;
}

/**
 * One emitted module — a rewritten parent shell or an extracted segment,
 * discriminated on `kind`. Source maps are not yet wired, so every `map`
 * field is always `null`.
 */
export type TransformModule = TransformModuleParent | TransformModuleSegment;

/** Rewritten parent module — the original file's QRL-referenced shell. */
export interface TransformModuleParent {
  readonly kind: 'parent';

  readonly path: RelativePath;

  readonly isEntry: false;

  readonly code: string;

  readonly map: string | null;

  readonly origPath: string;
}

/** Extracted segment module — a single `$()` body lifted into its own lazy-loadable file (`code` is empty for inline-strategy segments). */
export interface TransformModuleSegment {
  readonly kind: 'segment';

  readonly path: RelativePath;

  readonly isEntry: true;

  readonly code: string;

  readonly map: string | null;

  readonly segment: SegmentAnalysis;
}

/**
 * Per-segment metadata emitted alongside each extracted segment module and
 * used by the runtime to wire `qrl(...)` references to the correct file.
 * `captures` is derived from `captureNames` at extraction time and can diverge
 * from it during later filtering (props consolidation, const inline,
 * migration).
 */
export interface SegmentAnalysis {
  readonly origin: Origin;

  readonly name: SymbolName;

  readonly entry: string | null;

  readonly displayName: DisplayName;

  readonly hash: Hash;

  readonly canonicalFilename: CanonicalFilename;

  readonly extension: string;

  readonly parent: SymbolName | null;

  readonly ctxKind: 'eventHandler' | 'function' | 'jSXProp';

  readonly ctxName: CtxName;

  readonly captures: boolean;

  readonly loc: readonly [ByteOffset, ByteOffset];
}

/**
 * `SegmentAnalysis` plus the snapshot-only fields (`paramNames`,
 * `captureNames`) that appear in metadata blocks but aren't part of the public
 * API. `captureNames` is mutated across Phase 4–5 (props consolidation, const
 * inline, migration filtering) before being snapshotted.
 */
export interface SegmentMetadataInternal extends SegmentAnalysis {
  readonly paramNames?: readonly string[];

  readonly captureNames?: readonly string[];
}

/**
 * Per-symbol override map mixin for the `EntryStrategy` variants that emit
 * separate segment files. `inline`/`hoist` deliberately omit it — they emit
 * bodies inside the parent, so there is no per-segment file path to override.
 */
export interface WithManualEntryMap {
  readonly manual?: Record<string, string>;
}

/**
 * How the optimizer lays out lazy-load boundaries. `smart`/`segment`/`hook`
 * emit one file per segment; `inline`/`hoist` keep bodies in the parent;
 * `single` bundles every segment into one `entry_hooks` file; `component`
 * groups by enclosing `component$`. The file-emitting variants accept a
 * per-symbol manual override via {@link WithManualEntryMap}.
 */
export type EntryStrategy =
  | { type: 'inline' }
  | { type: 'hoist' }
  | (WithManualEntryMap & { type: 'hook' })
  | (WithManualEntryMap & { type: 'segment' })
  | (WithManualEntryMap & { type: 'single' })
  | (WithManualEntryMap & { type: 'component' })
  | (WithManualEntryMap & { type: 'smart' });

export function hasManualEntryMap(
  s: EntryStrategy,
): s is EntryStrategy & WithManualEntryMap {
  return s.type !== 'inline' && s.type !== 'hoist';
}

/** Post-transform parent-module simplification level. */
export type MinifyMode = 'simplify' | 'none';

/**
 * Build flavor for the emit pipeline: `prod` rewrites symbols to short
 * `s_<hash>` form; `dev` keeps long names and emits `qrlDEV(...)` metadata;
 * `hmr` adds `useHmr(devFile)` injection on `component$` segments; `lib`
 * inlines bodies as `inlinedQrl(body, name)` in a single module; `test`
 * applies no special handling.
 */
export type EmitMode = 'dev' | 'prod' | 'lib' | 'hmr' | 'test';

/**
 * Source-range descriptor for diagnostics: byte offsets (`lo` inclusive, `hi`
 * exclusive) plus line/column pairs. Lines are 1-based; columns are 0-based.
 */
export interface DiagnosticHighlightFlat {
  readonly lo: ByteOffset;
  readonly hi: ByteOffset;
  readonly startLine: LineNumber;
  readonly startCol: ColumnNumber;
  readonly endLine: LineNumber;
  readonly endCol: ColumnNumber;
}

/**
 * One error or warning surfaced by the optimizer, collected into
 * `TransformOutput.diagnostics`. Suppressible from source via
 * `// @qwik-disable-next-line <code>` directives. `suggestions` is always
 * `null` (not yet wired).
 */
export interface Diagnostic {
  readonly category: 'error' | 'warning';

  readonly code: string;

  readonly file: string;

  readonly message: string;

  readonly highlights: readonly DiagnosticHighlightFlat[] | null;

  readonly suggestions: null;

  readonly scope: string;
}
