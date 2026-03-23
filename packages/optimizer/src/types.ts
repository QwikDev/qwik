/** @public */
export interface Optimizer {
  /** Transforms the input code string, does not access the file system. */
  transformModules(opts: TransformModulesOptions): Promise<TransformOutput>;

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
  _optimizer?: typeof import('@qwik.dev/optimizer');
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
  /** The parameter names if it's a function with parameters */
  paramNames?: string[];
  /** The transformed names of scoped variables, if any */
  captureNames?: string[];
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
  highlights: SourceLocation[] | null;
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
export type EmitMode = 'dev' | 'prod' | 'lib' | 'hmr';

/** @public */
export interface InlineEntryStrategy {
  type: 'inline';
}

/** @public */
export interface HoistEntryStrategy {
  type: 'hoist';
}

/** @public @deprecated Use SegmentStrategy instead */
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
