// `createOptimizer` factory.
//
// Provides an async factory plus a `transformModules(opts): Promise<...>`
// instance so a bundler call site like
//
//   const result = await (await getOptimizer()).transformModules(opts);
//
// reads through unchanged. Internally everything wraps the synchronous
// `transformModule`; the Promise returns satisfy the async contract without any
// real async work.

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
} from './optimizer/types/types.js';
import { mkFilePath, mkSourceText } from './optimizer/types/brands.js';

/**
 * Runtime environment the optimizer is executing in. Default `'node'` — the only
 * environment this optimizer has been exercised in.
 */
export type SystemEnvironment =
  | 'node'
  | 'deno'
  | 'bun'
  | 'webworker'
  | 'browsermain'
  | 'unknown';

/**
 * Path utilities, shaped like Node's `path` module; `pathe` provides the
 * implementation. `win32` is intentionally `null` — `pathe` normalises
 * separators, so the platform-specific variant isn't needed at this boundary.
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
 * Host-system surface the optimizer can call back into. The transform pipeline
 * never reads `sys` today — the field exists for compatibility at the public
 * boundary so provider-swapping consumers find the same field set.
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
 * Options for `createOptimizer`. All fields are passthrough: `sys` is preserved
 * on the instance if provided (otherwise a default stub is built); the others
 * (`binding`/`inlineStylesUpToBytes`/`sourcemap`/`_optimizer`) are accepted for
 * type-compatibility but not read. The bundler call site currently passes
 * `undefined`; the passthrough fields let an existing options object be reused
 * unmodified when swapping providers.
 */
export interface OptimizerOptions {
  sys?: OptimizerSystem;
  binding?: unknown;
  inlineStylesUpToBytes?: number;
  sourcemap?: boolean;
  _optimizer?: unknown;
}

// Raw-string transform types — the boundary the `Napi*` type family speaks.
//
// Consumers hand over unbranded paths and source text and read back mutable
// arrays with `segment`/`origPath` null-arms on every module; brands are
// established internally via the smart constructors. `NapiSegmentAnalysis.ctxKind`
// includes `'jSXProp'` because the optimizer emits a JSX-prop segment kind.

/**
 * One source file for {@link QwikOptimizer.transformModules}. `program` is an
 * optional pre-parsed Program (e.g. Rolldown's `meta.ast`) that skips the
 * internal parse; `module` is its ESM-metadata sibling.
 */
export interface NapiTransformModuleInput {
  path: string;
  code: string;
  devPath?: string;
  program?: AstProgram;
  module?: AstEcmaScriptModule;
}

/** Raw-string mirror of `TransformModulesOptions`. */
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

/** Plain-string mirror of `SegmentAnalysis`. */
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
 * Module record with no `kind` discriminant — the `segment`/`origPath` null-arms
 * distinguish the two shapes (parents carry `origPath`, segments carry `segment`).
 */
export interface NapiTransformModule {
  path: string;
  isEntry: boolean;
  code: string;
  map: string | null;
  segment: NapiSegmentAnalysis | null;
  origPath: string | null;
}

/** Plain-number mirror of `DiagnosticHighlightFlat`. */
export interface NapiSourceLocation {
  lo: number;
  hi: number;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

/**
 * Diagnostic record. `category` includes `'sourceError'` for boundary
 * compatibility, though this implementation only emits `'error' | 'warning'`.
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

/** Transform result: fresh mutable arrays, NAPI module records. */
export interface NapiTransformOutput {
  modules: NapiTransformModule[];
  diagnostics: NapiDiagnostic[];
  isTypeScript: boolean;
  isJsx: boolean;
}

/**
 * Optimizer instance. `transformModules` wraps the synchronous `transformModule`
 * and returns a Promise so the call site can `await` it; it speaks the raw
 * NAPI-parity types (inputs branded internally, outputs mapped to the public
 * shape). `sys` is the host-system surface (see {@link OptimizerSystem}).
 */
export interface QwikOptimizer {
  transformModules(opts: NapiTransformModulesOptions): Promise<NapiTransformOutput>;
  sys: OptimizerSystem;
}

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

function toNapiSegment(segment: SegmentAnalysis): NapiSegmentAnalysis {
  return { ...segment, loc: [segment.loc[0], segment.loc[1]] };
}

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

/**
 * `pathe` provides a full Node-`path`-shaped module. Cast through the
 * structural-subset boundary once here so consumers need no per-call casts.
 * `win32` is narrowed to `null`; separator normalisation is sufficient.
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
    // `posix` self-references `path`; a getter defers so the closure sees the built object.
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

/**
 * Build an optimizer instance. Returns a Promise so a `await createOptimizer(...)`
 * call site can await it, though the underlying `transformModule` is synchronous.
 * `options.sys` is preserved if provided; otherwise a default stub is built. Other
 * `OptimizerOptions` fields are accepted for type-compatibility but not read.
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
