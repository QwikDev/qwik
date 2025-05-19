/** @public */
export interface Optimizer {
  /** Transforms the input code string, does not access the file system. */
  transformModules(opts: TransformModulesOptions): Promise<TransformOutput>;

  /** Transforms the input code string, does not access the file system. */
  transformModulesSync(opts: TransformModulesOptions): TransformOutput;

  /** Transforms the directory from the file system. */
  transformFs(opts: TransformFsOptions): Promise<TransformOutput>;

  /** Transforms the directory from the file system. */
  transformFsSync(opts: TransformFsOptions): TransformOutput;

  /** Optimizer system use. This can be updated with a custom file system. */
  sys: OptimizerSystem;
}

/** @public */
export interface OptimizerOptions {
  sys?: OptimizerSystem;
  binding?: any;
  /** Inline the global styles if they're smaller than this */
  inlineStylesUpToBytes?: number;
  /** Enable sourcemaps */
  sourcemap?: boolean;
}

/** @public */
export interface OptimizerSystem {
  cwd: () => string;
  env: SystemEnvironment;
  os: string;
  dynamicImport: (path: string) => Promise<any>;
  strictDynamicImport: (path: string) => Promise<any>;
  getInputFiles?: (rootDir: string) => Promise<TransformModuleInput[]>;
  path: Path;
}

/** @public */
export type SystemEnvironment = 'node' | 'deno' | 'bun' | 'webworker' | 'browsermain' | 'unknown';

// OPTIONS ***************

/** @public */
export type SourceMapsOption = 'external' | 'inline' | undefined | null;

/** @public */
export type TranspileOption = boolean | undefined | null;

/** @public */
export interface TransformOptions {
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
  stripExports?: string[];
  regCtxName?: string[];
  stripCtxName?: string[];
  stripEventHandlers?: boolean;
  isServer?: boolean;
}

/** @public */
export interface TransformModulesOptions extends TransformOptions {
  input: TransformModuleInput[];
}

/** @public */
export interface TransformFsOptions extends TransformOptions {
  vendorRoots: string[];
}

// OPTION INPUTS ***************

/** @public */
export interface TransformModuleInput {
  path: string;
  devPath?: string;
  code: string;
}

// RESULT ***************

/** @public */
export interface TransformOutput {
  modules: TransformModule[];
  diagnostics: Diagnostic[];
  isTypeScript: boolean;
  isJsx: boolean;
}

/** @public */
export interface SegmentAnalysis {
  origin: string;
  name: string;
  entry: string | null;
  displayName: string;
  hash: string;
  canonicalFilename: string;
  extension: string;
  parent: string | null;
  ctxKind: 'eventHandler' | 'function';
  ctxName: string;
  captures: boolean;
  loc: [number, number];
}

// RESULT OUTPUT ***************

/** @public */
export interface TransformModule {
  path: string;
  isEntry: boolean;
  code: string;
  map: string | null;
  segment: SegmentAnalysis | null;
  origPath: string | null;
}

// DIAGNOSTICS ***************

/** @public */
export interface Diagnostic {
  scope: string;
  category: DiagnosticCategory;
  code: string | null;
  file: string;
  message: string;
  highlights: SourceLocation[];
  suggestions: string[] | null;
}

/** @public */
export interface SourceLocation {
  hi: number;
  lo: number;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

/** @public */
export type DiagnosticCategory = 'error' | 'warning' | 'sourceError';

// ENTRY STRATEGY ***************

/** @public */
export type EntryStrategy =
  | InlineEntryStrategy
  | HoistEntryStrategy
  | SingleEntryStrategy
  | HookEntryStrategy
  | SegmentEntryStrategy
  | ComponentEntryStrategy
  | SmartEntryStrategy;

/** @public */
export type MinifyMode = 'simplify' | 'none';

/** @public */
export type EmitMode = 'dev' | 'prod' | 'lib';

/** @public */
export interface InlineEntryStrategy {
  type: 'inline';
}

/** @public */
export interface HoistEntryStrategy {
  type: 'hoist';
}

/** @deprecated Use SegmentStrategy instead */
export interface HookEntryStrategy {
  type: 'hook';
  manual?: Record<string, string>;
}

/** @public */
export interface SegmentEntryStrategy {
  type: 'segment';
  manual?: Record<string, string>;
}

/** @public */
export interface SingleEntryStrategy {
  type: 'single';
  manual?: Record<string, string>;
}

/** @public */
export interface ComponentEntryStrategy {
  type: 'component';
  manual?: Record<string, string>;
}

/** @public */
export interface SmartEntryStrategy {
  type: 'smart';
  manual?: Record<string, string>;
}

/**
 * The metadata of the build. One of its uses is storing where QRL symbols are located.
 *
 * @public
 */
export interface QwikManifest {
  /** Content hash of the manifest, if this changes, the code changed */
  manifestHash: string;
  /** QRL symbols */
  symbols: { [symbolName: string]: QwikSymbol };
  /** Where QRLs are located */
  mapping: { [symbolName: string]: string };
  /** All code bundles, used to know the import graph */
  bundles: { [fileName: string]: QwikBundle };
  /** All bundles in a compact graph format with probabilities */
  bundleGraph?: QwikBundleGraph;
  /** The preloader bundle fileName */
  preloader?: string;
  /** The Qwik core bundle fileName */
  core?: string;
  /** CSS etc to inject in the document head */
  injections?: GlobalInjections[];
  /** The version of the manifest */
  version: string;
  /** The options used to build the manifest */
  options?: {
    target?: string;
    buildMode?: string;
    entryStrategy?: { type: EntryStrategy['type'] };
  };
  /** The platform used to build the manifest */
  platform?: { [name: string]: string };
}
/**
 * The manifest values that are needed for SSR.
 *
 * @public
 */
export type ServerQwikManifest = Pick<
  QwikManifest,
  'manifestHash' | 'injections' | 'bundleGraph' | 'mapping' | 'preloader' | 'core'
>;

/**
 * Bundle graph.
 *
 * Format: [ 'bundle-a.js', 3, 5 // Depends on 'bundle-b.js' and 'bundle-c.js' 'bundle-b.js', 5, //
 * Depends on 'bundle-c.js' 'bundle-c.js', ]
 *
 * @public
 */
export type QwikBundleGraph = Array<string | number>;

/** @public */
export type SymbolMapper = Record<string, readonly [symbol: string, chunk: string]>;

/** @public */
export type SymbolMapperFn = (
  symbolName: string,
  mapper: SymbolMapper | undefined,
  parent?: string
) => readonly [symbol: string, chunk: string] | undefined;

/** @public */
export interface QwikSymbol {
  origin: string;
  displayName: string;
  hash: string;
  canonicalFilename: string;
  ctxKind: 'function' | 'eventHandler';
  ctxName: string;
  captures: boolean;
  parent: string | null;
  loc: [number, number];
}

/** @public */
export interface QwikBundle {
  /** Size of the bundle */
  size: number;
  /** Total size of this bundle's static import graph */
  total: number;
  /** Interactivity score of the bundle */
  interactivity?: number;
  /** Symbols in the bundle */
  symbols?: string[];
  /** Direct imports */
  imports?: string[];
  /** Dynamic imports */
  dynamicImports?: string[];
  /** Source files of the bundle */
  origins?: string[];
}

/** @public */
export interface GlobalInjections {
  tag: string;
  attributes?: { [key: string]: string };
  location: 'head' | 'body';
}

// PATH UTIL  ***************

/** @public */
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

/** @public */
export interface ResolvedManifest {
  mapper: SymbolMapper;
  manifest: QwikManifest;
  injections: GlobalInjections[];
}
