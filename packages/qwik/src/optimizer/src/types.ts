/**
 * @alpha
 */
export interface Optimizer {
  /**
   * Transforms the input code string, does not access the file system.
   */
  transformModules(opts: TransformModulesOptions): Promise<TransformOutput>;

  /**
   * Transforms the input code string, does not access the file system.
   */
  transformModulesSync(opts: TransformModulesOptions): TransformOutput;

  /**
   * Transforms the directory from the file system.
   */
  transformFs(opts: TransformFsOptions): Promise<TransformOutput>;

  /**
   * Transforms the directory from the file system.
   */
  transformFsSync(opts: TransformFsOptions): TransformOutput;

  /**
   * Optimizer system use. This can be updated with a custom file system.
   */
  sys: OptimizerSystem;
}

/**
 * @alpha
 */
export interface OptimizerOptions {
  sys?: OptimizerSystem;
  binding?: any;
}

/**
 * @alpha
 */
export interface OptimizerSystem {
  cwd: () => string;
  env: SystemEnvironment;
  os: string;
  dynamicImport: (path: string) => Promise<any>;
  getInputFiles?: (rootDir: string) => Promise<TransformModuleInput[]>;
  path: Path;
}

/**
 * @alpha
 */
export type SystemEnvironment = 'node' | 'deno' | 'webworker' | 'browsermain' | 'unknown';

// OPTIONS ***************

/**
 * @alpha
 */
export type SourceMapsOption = 'external' | 'inline' | undefined | null;

/**
 * @alpha
 */
export type TranspileOption = boolean | undefined | null;

/**
 * @alpha
 */
export interface TransformOptions {
  rootDir: string;
  entryStrategy?: EntryStrategy;
  minify?: MinifyMode;
  sourceMaps?: boolean;
  transpile?: boolean;
  explicityExtensions?: boolean;
  dev?: boolean;
  scope?: string;
}

/**
 * @alpha
 */
export interface TransformModulesOptions extends TransformOptions {
  input: TransformModuleInput[];
}

/**
 * @alpha
 */
export interface TransformFsOptions extends TransformOptions {}

// OPTION INPUTS ***************

/**
 * @alpha
 */
export interface TransformModuleInput {
  path: string;
  code: string;
}

// RESULT ***************

/**
 * @alpha
 */
export interface TransformOutput {
  modules: TransformModule[];
  diagnostics: Diagnostic[];
  isTypeScript: boolean;
  isJsx: boolean;
}

/**
 * @alpha
 */
export interface HookAnalysis {
  origin: string;
  name: string;
  entry: string | null;
  displayName: string;
  hash: string;
  canonicalFilename: string;
  extension: string;
  parent: string | null;
  ctxKind: 'event' | 'function';
  ctxName: string;
  captures: boolean;
}

// RESULT OUTPUT ***************

/**
 * @alpha
 */
export interface TransformModule {
  path: string;
  isEntry: boolean;
  code: string;
  map: string | null;
  hook: HookAnalysis | null;
}

// DIAGNOSTICS ***************

/**
 * @alpha
 */
export interface Diagnostic {
  origin: string;
  message: string;
  severity: DiagnosticType;
  code_highlights: CodeHighlight[];
  documentation_url?: string;
  show_environment: boolean;
  hints?: string[];
}

/**
 * @alpha
 */
export interface CodeHighlight {
  message: string | null;
  loc: SourceLocation;
}

/**
 * @alpha
 */
export interface SourceLocation {
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
}

/**
 * @alpha
 */
export type DiagnosticType = 'Error' | 'Warning' | 'SourceError';

// ENTRY STRATEGY ***************

/**
 * @alpha
 */
export type EntryStrategy =
  | InlineEntryStrategy
  | SingleEntryStrategy
  | HookEntryStrategy
  | ComponentEntryStrategy
  | SmartEntryStrategy
  | ManualEntryStrategy;

/**
 * @alpha
 */
export type MinifyMode = 'simplify' | 'none';

/**
 * @alpha
 */
export interface InlineEntryStrategy {
  type: 'inline';
}

/**
 * @alpha
 */
export interface SingleEntryStrategy {
  type: 'single';
}

/**
 * @alpha
 */
export interface HookEntryStrategy {
  type: 'hook';
}

/**
 * @alpha
 */
export interface ComponentEntryStrategy {
  type: 'component';
}

/**
 * @alpha
 */
export interface SmartEntryStrategy {
  type: 'smart';
}

/**
 * @alpha
 */
export interface ManualEntryStrategy {
  type: 'manual';
  entries: string[][];
}

/**
 * @alpha
 */
export interface QwikManifest {
  symbols: { [symbolName: string]: QwikSymbol };
  mapping: { [symbolName: string]: string };
  bundles: { [fileName: string]: QwikBundle };
  injections?: GlobalInjections[];
  version: string;
  options?: {
    target?: string;
    buildMode?: string;
    forceFullBuild?: boolean;
    entryStrategy?: { [key: string]: any };
  };
  platform?: { [name: string]: string };
}

/**
 * @alpha
 */
export interface QwikSymbol {
  origin: string;
  displayName: string;
  hash: string;
  canonicalFilename: string;
  ctxKind: 'function' | 'event';
  ctxName: string;
  captures: boolean;
  parent: string | null;
}

/**
 * @alpha
 */
export interface QwikBundle {
  size: number;
  symbols: string[];
  imports?: string[];
  dynamicImports?: string[];
}

/**
 * @alpha
 */
export interface GlobalInjections {
  tag: string;
  attributes?: { [key: string]: string };
  location: 'head' | 'body';
  children?: string;
}

export interface GeneratedOutputBundle {
  fileName: string;
  modules: {
    [id: string]: any;
  };
  imports: string[];
  dynamicImports: string[];
  size: number;
}

// PATH UTIL  ***************

/**
 * @alpha
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
