// SWC-shape `createOptimizer` factory.
//
// Sub-B of OSS-450 qwik-bundler integration. The bundler's call site
// (qwik-bundler/src/rolldown.ts:354) does:
//
//   const result = await (await getOptimizer()).transformModules(opts);
//
// where `getOptimizer()` returns `createOptimizer(options)`. SWC's
// signature is `createOptimizer(opts?: OptimizerOptions): Promise<Optimizer>`,
// and the Optimizer instance exposes `transformModules(opts): Promise<TransformOutput>`
// plus a `sys: OptimizerSystem` field. This module mirrors that shape so
// the bundler's call site reads through unchanged when the optimizer
// provider is swapped.
//
// Internally everything wraps the synchronous `transformModule`. The Promise
// returns satisfy the contract without introducing real async — there's no
// napi binding to load.

import * as nodePath from 'pathe';

import { transformModule } from './optimizer/transform/index.js';

import type {
  TransformModulesOptions,
  TransformOutput,
} from './optimizer/types.js';

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

/**
 * Optimizer instance. Mirrors SWC's `Optimizer`.
 *
 * `transformModules` wraps the synchronous `transformModule` from
 * `optimizer/transform/index.ts` and returns a Promise so the call site
 * matches SWC's async surface. `sys` is the host-system surface (see
 * {@link OptimizerSystem}).
 */
export interface QwikOptimizer {
  transformModules(opts: TransformModulesOptions): Promise<TransformOutput>;
  sys: OptimizerSystem;
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
      return Promise.resolve(transformModule(opts));
    },
  };
  return Promise.resolve(instance);
}
