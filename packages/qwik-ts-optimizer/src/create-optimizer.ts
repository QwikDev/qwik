// SWC-shape `createOptimizer` factory.
//
// Mirrors `@qwik.dev/optimizer`'s public surface so a bundler call site like
//
//   const result = await (await getOptimizer()).transformModules(opts);
//
// reads through unchanged when the optimizer provider is swapped. SWC's
// signature is `createOptimizer(opts?: OptimizerOptions): Promise<Optimizer>`,
// and the Optimizer instance exposes `transformModules(opts): Promise<TransformOutput>`
// plus a `sys: OptimizerSystem` field — this module reproduces that shape.
//
// Internally everything wraps the synchronous `transformModule`. The Promise
// returns satisfy the contract without introducing real async — there's no
// napi binding to load.

import * as nodePath from 'pathe';

import { transformModule } from './optimizer/transform/index.js';

import type {
  AstEcmaScriptModule,
  AstProgram,
} from './ast-types.js';
import type {
  Diagnostic,
  EmitMode,
  EntryStrategy,
  MinifyMode,
  SegmentAnalysis,
  TransformModule,
  TransformModulesOptions,
} from './optimizer/types.js';
import { mkFilePath, mkSourceText } from './optimizer/types/brands.js';

// ---------------------------------------------------------------------------
// Public types — mirror SWC's `@qwik.dev/optimizer` surface
// ---------------------------------------------------------------------------

/**
 * Runtime environment the optimizer is executing in. Mirrors SWC's
 * `SystemEnvironment` exactly. Default `'node'` — the only environment the
 * TS optimizer has been exercised in.
 */
export type SystemEnvironment =
  | 'node'
  | 'deno'
  | 'bun'
  | 'webworker'
  | 'browsermain'
  | 'unknown';

/**
 * Path utilities. Shape mirrors SWC's `Path` interface, which itself
 * mirrors Node's `path` module. `pathe` provides the implementation.
 *
 * `win32` is intentionally `null` to match SWC's narrowed type — `pathe`
 * normalises separators so the platform-specific variant isn't needed at
 * the public boundary.
 */
export interface Path {
  resolve(...paths: string[]): string;
  normalize(path: string): string;
  isAbsolute(path: string): boolean;
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  dirname(path: string): string;
  basename(path: string, ext?: string): string;
  extname(path: string): string;
  format(pathObject: {
    root: string;
    dir: string;
    base: string;
    ext: string;
    name: string;
  }): string;
  parse(path: string): {
    root: string;
    dir: string;
    base: string;
    ext: string;
    name: string;
  };
  readonly sep: string;
  readonly delimiter: string;
  readonly win32: null;
  readonly posix: Path;
}

/**
 * Host-system surface the optimizer can call back into. Mirrors SWC's
 * `OptimizerSystem`. Consumers swapping providers can rely on the same
 * field set being present.
 *
 * The TS optimizer's transform pipeline never reads `sys` today — the
 * field exists for SWC-parity at the public boundary. Tools that
 * historically poked at `optimizer.sys` from outside will find the same
 * shape.
 */
export interface OptimizerSystem {
  cwd: () => string;
  env: SystemEnvironment;
  os: string;
  dynamicImport: (path: string) => Promise<unknown>;
  strictDynamicImport: (path: string) => Promise<unknown>;
  getInputFiles?: (rootDir: string) => Promise<readonly unknown[]>;
  path: Path;
}

/**
 * Options for `createOptimizer`. Mirrors SWC's `OptimizerOptions`.
 *
 * All fields are passthrough: `sys` is preserved on the instance if
 * provided (otherwise a default stub is built); the others
 * (`binding`/`inlineStylesUpToBytes`/`sourcemap`/`_optimizer`) are
 * accepted for type-compatibility with the SWC factory call site but
 * not read by this implementation.
 *
 * The bundler call site (`createOptimizer(options.optimizerOptions)` in
 * qwik-bundler/src/rolldown.ts) currently passes `undefined`; the
 * passthrough fields exist so an existing SWC integration's options
 * object can be reused unmodified when swapping providers.
 */
export interface OptimizerOptions {
  sys?: OptimizerSystem;
  binding?: unknown;
  inlineStylesUpToBytes?: number;
  sourcemap?: boolean;
  _optimizer?: unknown;
}

// ---------------------------------------------------------------------------
// NAPI-parity transform types — the raw-string boundary
// ---------------------------------------------------------------------------
//
// `createOptimizer` is the SWC parity entry point, and SWC's NAPI binding
// speaks plain strings: consumers typed against `@qwik.dev/optimizer` hand
// over unbranded paths and source text, and read back mutable arrays with
// `segment`/`origPath` null-arms on every module. The types below mirror
// that declared interface so an SWC call site reads through unchanged —
// the brands are established internally via the smart constructors (the
// raw input is the boundary; `mk*` is where the invariant is born).
//
// One deliberate deviation from SWC's *declared* interface:
// `NapiSegmentAnalysis.ctxKind` includes `'jSXProp'`. SWC's published
// `.d.ts` declares only `'eventHandler' | 'function'`, but the Rust
// optimizer emits `SegmentKind::JSXProp` (swc-reference-only/transform.rs)
// and so do we. The published SWC type is stale; this type follows the
// runtime truth shared by both implementations.

/** One source file for {@link QwikOptimizer.transformModules}. Raw-string mirror of `TransformModuleInput`. */
export interface NapiTransformModuleInput {
  path: string;
  code: string;
  devPath?: string;
  /** Optional pre-parsed Program (e.g. Rolldown's `meta.ast`) — skips the internal parse. */
  program?: AstProgram;
  /** Optional ESM-module metadata sibling to `program`. */
  module?: AstEcmaScriptModule;
}

/** Raw-string mirror of `TransformModulesOptions` for the SWC-parity surface. */
export interface NapiTransformModulesOptions {
  input: readonly NapiTransformModuleInput[];
  srcDir: string;
  rootDir?: string;
  entryStrategy?: EntryStrategy;
  minify?: MinifyMode;
  sourceMaps?: boolean;
  transpileTs?: boolean;
  transpileJsx?: boolean;
  preserveFilenames?: boolean;
  explicitExtensions?: boolean;
  mode?: EmitMode;
  scope?: string;
  stripExports?: readonly string[];
  regCtxName?: readonly string[];
  stripCtxName?: readonly string[];
  stripEventHandlers?: boolean;
  isServer?: boolean;
}

/** Plain-string mirror of `SegmentAnalysis`, shaped like SWC's NAPI output. */
export interface NapiSegmentAnalysis {
  origin: string;
  name: string;
  entry: string | null;
  displayName: string;
  hash: string;
  canonicalFilename: string;
  extension: string;
  parent: string | null;
  ctxKind: 'eventHandler' | 'function' | 'jSXProp';
  ctxName: string;
  captures: boolean;
  loc: [number, number];
  paramNames?: string[];
  captureNames?: string[];
}

/**
 * SWC-shaped module record: no `kind` discriminant; instead the
 * `segment`/`origPath` null-arms SWC's NAPI binding emits (parents carry
 * `origPath`, segments carry `segment`).
 */
export interface NapiTransformModule {
  path: string;
  isEntry: boolean;
  code: string;
  map: string | null;
  segment: NapiSegmentAnalysis | null;
  origPath: string | null;
}

/** Plain-number mirror of `DiagnosticHighlightFlat` (SWC's `SourceLocation`). */
export interface NapiSourceLocation {
  lo: number;
  hi: number;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

/**
 * SWC-shaped diagnostic. `category` includes `'sourceError'` because SWC
 * declares it; this implementation only emits `'error' | 'warning'`.
 */
export interface NapiDiagnostic {
  scope: string;
  category: 'error' | 'warning' | 'sourceError';
  code: string | null;
  file: string;
  message: string;
  highlights: NapiSourceLocation[] | null;
  suggestions: string[] | null;
}

/** SWC-shaped transform result: fresh mutable arrays, NAPI module records. */
export interface NapiTransformOutput {
  modules: NapiTransformModule[];
  diagnostics: NapiDiagnostic[];
  isTypeScript: boolean;
  isJsx: boolean;
}

/**
 * Optimizer instance. Mirrors SWC's `Optimizer`.
 *
 * `transformModules` wraps the synchronous `transformModule` from
 * `optimizer/transform/index.ts` and returns a Promise so the call site
 * matches SWC's async surface. It speaks the NAPI-parity raw types: inputs
 * are branded internally, outputs are mapped to SWC's declared shape.
 * `sys` is the host-system surface (see {@link OptimizerSystem}).
 */
export interface QwikOptimizer {
  transformModules(opts: NapiTransformModulesOptions): Promise<NapiTransformOutput>;
  sys: OptimizerSystem;
}

// ---------------------------------------------------------------------------
// NAPI boundary mapping
// ---------------------------------------------------------------------------

/** Brand the raw NAPI options into the native transform input. */
function brandTransformOptions(
  opts: NapiTransformModulesOptions,
): TransformModulesOptions {
  return {
    ...opts,
    srcDir: mkFilePath(opts.srcDir),
    input: opts.input.map((input) => ({
      ...input,
      path: mkFilePath(input.path),
      code: mkSourceText(input.code),
    })),
  };
}

/** Widen a native segment record to the NAPI shape (brands erase downward). */
function toNapiSegment(segment: SegmentAnalysis): NapiSegmentAnalysis {
  return { ...segment, loc: [segment.loc[0], segment.loc[1]] };
}

/** Map a `kind`-discriminated native module onto SWC's null-arm record shape. */
function toNapiModule(module: TransformModule): NapiTransformModule {
  switch (module.kind) {
    case 'parent':
      return {
        path: module.path,
        isEntry: module.isEntry,
        code: module.code,
        map: module.map,
        segment: null,
        origPath: module.origPath,
      };
    case 'segment':
      return {
        path: module.path,
        isEntry: module.isEntry,
        code: module.code,
        map: module.map,
        segment: toNapiSegment(module.segment),
        origPath: null,
      };
    default: {
      const _exhaustive: never = module;
      throw new Error(
        `unhandled module kind: ${(module as { kind?: string }).kind}`,
      );
    }
  }
}

function toNapiDiagnostic(diagnostic: Diagnostic): NapiDiagnostic {
  let highlights: NapiSourceLocation[] | null = null;
  if (diagnostic.highlights !== null) {
    highlights = diagnostic.highlights.map((highlight) => ({ ...highlight }));
  }
  return { ...diagnostic, highlights };
}

// ---------------------------------------------------------------------------
// Default OptimizerSystem stub
// ---------------------------------------------------------------------------

/**
 * `pathe` provides a full Node-`path`-shaped module. Cast through the
 * structural-subset boundary once here so the public `Path` type stays
 * SWC-parity'd without per-call casts at consumers.
 *
 * `pathe` exports `posix` and `win32` variants too, but the SWC surface
 * narrows `win32` to `null` (separator normalisation is sufficient at
 * the boundary).
 */
function buildDefaultPath(): Path {
  const path: Path = {
    resolve: nodePath.resolve,
    normalize: nodePath.normalize,
    isAbsolute: nodePath.isAbsolute,
    join: nodePath.join,
    relative: nodePath.relative,
    dirname: nodePath.dirname,
    basename: nodePath.basename,
    extname: nodePath.extname,
    format: nodePath.format,
    parse: nodePath.parse,
    sep: nodePath.sep,
    delimiter: nodePath.delimiter,
    win32: null,
    // `posix` is recursive — self-reference established after the object
    // is built so the closure captures the final `path` reference.
    get posix(): Path {
      return path;
    },
  };
  return path;
}

function buildDefaultSystem(): OptimizerSystem {
  return {
    cwd: () => process.cwd(),
    env: 'node',
    os: process.platform,
    dynamicImport: (p) => import(p),
    strictDynamicImport: (p) => import(p),
    path: buildDefaultPath(),
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build an optimizer instance. SWC parity entry point.
 *
 * Returns a Promise so the bundler's `await createOptimizer(...)` call
 * site (qwik-bundler/src/rolldown.ts:354) matches SWC's signature. The
 * underlying `transformModule` is synchronous; nothing is actually async
 * here, but `Promise.resolve(instance)` satisfies the contract.
 *
 * `options.sys` is preserved on the instance if provided; otherwise a
 * default stub is built. Other `OptimizerOptions` fields are accepted
 * for type-compatibility with the SWC factory but not read.
 */
export function createOptimizer(
  options?: OptimizerOptions,
): Promise<QwikOptimizer> {
  const sys = options?.sys ?? buildDefaultSystem();
  const instance: QwikOptimizer = {
    sys,
    transformModules(opts) {
      const output = transformModule(brandTransformOptions(opts));
      return Promise.resolve({
        modules: output.modules.map(toNapiModule),
        diagnostics: output.diagnostics.map(toNapiDiagnostic),
        isTypeScript: output.isTypeScript,
        isJsx: output.isJsx,
      });
    },
  };
  return Promise.resolve(instance);
}
