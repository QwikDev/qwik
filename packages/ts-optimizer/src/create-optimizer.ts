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

import {
  createTransformWorkerPool,
  getSharedTransformPool,
  resolvePoolSize,
} from './worker-pool.js';
import { runTransform } from './transform-run.js';

import type { AstEcmaScriptModule, AstProgram } from './ast-types.js';
import type { EmitMode, EntryStrategy, MinifyMode } from './optimizer/types/types.js';

/**
 * Runtime environment the optimizer is executing in. Default `'node'` — the only environment this
 * optimizer has been exercised in.
 */
export type SystemEnvironment = 'node' | 'deno' | 'bun' | 'webworker' | 'browsermain' | 'unknown';

/**
 * Path utilities, shaped like Node's `path` module; `pathe` provides the implementation. `win32` is
 * intentionally `null` — `pathe` normalises separators, so the platform-specific variant isn't
 * needed at this boundary.
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
 * Host-system surface the optimizer can call back into. The transform pipeline never reads `sys`
 * today — the field exists for compatibility at the public boundary so provider-swapping consumers
 * find the same field set.
 */
export interface OptimizerSystem {
  cwd: () => string;
  env: SystemEnvironment;
  os: string;
  dynamicImport: (path: string) => Promise<unknown>;
  strictDynamicImport: (path: string) => Promise<unknown>;
  path: Path;
}

/**
 * Options for `createOptimizer`. All fields are passthrough: `sys` is preserved on the instance if
 * provided (otherwise a default stub is built); the others
 * (`binding`/`inlineStylesUpToBytes`/`sourcemap`/`_optimizer`) are accepted for type-compatibility
 * but not read. The bundler call site currently passes `undefined`; the passthrough fields let an
 * existing options object be reused unmodified when swapping providers.
 */
export interface OptimizerOptions {
  sys?: OptimizerSystem;
  binding?: unknown;
  inlineStylesUpToBytes?: number;
  sourcemap?: boolean;
  _optimizer?: unknown;
  /**
   * Number of worker threads for transforms (Node only). Workers isolate transform allocations from
   * the host heap and run independent calls in parallel. `0`/`1` runs in-process. Default: `min(4,
   * cores - 1)`, overridable via `QWIK_TS_OPTIMIZER_WORKERS`; disabled under vitest.
   */
  workers?: number;
}

// Raw-string transform types — the boundary the `Napi*` type family speaks.
//
// Consumers hand over unbranded paths and source text and read back mutable
// arrays with `segment`/`origPath` null-arms on every module; brands are
// established internally via the smart constructors. `NapiSegmentAnalysis.ctxKind`
// includes `'jSXProp'` because the optimizer emits a JSX-prop segment kind.

/**
 * One source file for {@link QwikOptimizer.transformModules}. `program` is an optional pre-parsed
 * Program (e.g. Rolldown's `meta.ast`) that skips the internal parse; `module` is its ESM-metadata
 * sibling.
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
 * Module record with no `kind` discriminant — the `segment`/`origPath` null-arms distinguish the
 * two shapes (parents carry `origPath`, segments carry `segment`).
 */
export interface NapiTransformModule {
  path: string;
  isEntry: boolean;
  code: string;
  map: string | null;
  segment: NapiSegmentAnalysis | null;
  origPath: string | null;
  /** Import sources removed as unused (e.g. only consumed by stripped segments). */
  imports?: string[];
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
 * Diagnostic record. `category` includes `'sourceError'` for boundary compatibility, though this
 * implementation only emits `'error' | 'warning'`.
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
 * Optimizer instance. `transformModules` wraps the synchronous `transformModule` and returns a
 * Promise so the call site can `await` it; it speaks the raw NAPI-parity types (inputs branded
 * internally, outputs mapped to the public shape). `sys` is the host-system surface (see
 * {@link OptimizerSystem}).
 */
export interface QwikOptimizer {
  transformModules(opts: NapiTransformModulesOptions): Promise<NapiTransformOutput>;
  sys: OptimizerSystem;
  /** Terminates the worker pool, if one is active. Safe to omit — workers never block exit. */
  dispose?(): Promise<void>;
}

/**
 * `pathe` provides a full Node-`path`-shaped module. Cast through the structural-subset boundary
 * once here so consumers need no per-call casts. `win32` is narrowed to `null`; separator
 * normalisation is sufficient.
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
  const hasProcess = typeof process === 'object' && typeof process.cwd === 'function';
  const isWebWorker =
    !hasProcess && typeof (globalThis as { importScripts?: unknown }).importScripts === 'function';
  return {
    cwd: () => (hasProcess ? process.cwd() : '/'),
    env: hasProcess ? 'node' : isWebWorker ? 'webworker' : 'browsermain',
    os: hasProcess ? process.platform : 'unknown',
    dynamicImport: (p) => import(p),
    strictDynamicImport: (p) => import(p),
    path: buildDefaultPath(),
  };
}

/**
 * Build an optimizer instance. Returns a Promise so a `await createOptimizer(...)` call site can
 * await it, though the underlying `transformModule` is synchronous. `options.sys` is preserved if
 * provided; otherwise a default stub is built. Other `OptimizerOptions` fields are accepted for
 * type-compatibility but not read.
 */
export async function createOptimizer(options?: OptimizerOptions): Promise<QwikOptimizer> {
  const sys = options?.sys ?? buildDefaultSystem();
  // Explicit `workers` gets a private, disposable pool; the default shares one
  // process-wide pool so per-build optimizer instances don't multiply workers.
  const isPrivatePool = options?.workers !== undefined;
  const pool = isPrivatePool
    ? await createTransformWorkerPool(resolvePoolSize(options.workers))
    : await getSharedTransformPool(resolvePoolSize(undefined));
  return {
    sys,
    transformModules(opts) {
      if (pool) return pool.transformModules(opts);
      try {
        return Promise.resolve(runTransform(opts));
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }
    },
    dispose() {
      return pool && isPrivatePool ? pool.dispose() : Promise.resolve();
    },
  };
}
