/**
 * @alpha
 */
export interface Optimizer {
  isDirty: boolean;

  /**
   * Transforms the input code string, does not access the file system.
   */
  transformModules(opts: TransformModulesOptions): Promise<TransformResult>;

  /**
   * Transforms the input code string, does not access the file system.
   */
  transformModulesSync(opts: TransformModulesOptions): TransformResult;

  /**
   * Transforms the directory from the file system.
   */
  transformFs(opts: TransformFsOptions): Promise<TransformResult>;

  /**
   * Transforms the directory from the file system.
   */
  transformFsSync(opts: TransformFsOptions): TransformResult;

  getTransformedModule(path: string): TransformModule | undefined;

  hasTransformedModule(path: string): boolean;

  watchChange(id: string, event: 'create' | 'update' | 'delete'): void;

  path: Path;
}

// OPTIONS ***************

/**
 * @alpha
 */
export type MinifyOption = boolean | undefined | null;

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
interface TransformOptions {
  entryStrategy?: EntryStrategy;
  minify?: MinifyMode;
  sourceMaps?: boolean;
  transpile?: boolean;
}

/**
 * @alpha
 */
export interface TransformModulesOptions extends TransformOptions {
  rootDir: string;
  input: TransformModuleInput[];
}

/**
 * @alpha
 */
export interface TransformFsOptions extends TransformOptions {
  rootDir: string;

  // **/*.qwik.{js,jsx,ts,tsx}
  glob?: string;
}

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
export interface TransformResult {
  rootDir: string;
  modules: TransformModule[];
  diagnostics: Diagnostic[];
  isTypeScript: boolean;
  isJsx: boolean;
  hooks: HookAnalysis[];
}

/**
 * @alpha
 */
export interface HookAnalysis {
  origin: string;
  name: string;
  entry: string | null;
  canonicalFilename: string;
  localDecl: string[];
  localIdents: string[];
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
}

// DIAGNOSTICS ***************

/**
 * @alpha
 */
export interface Diagnostic {
  message: string;
  severity: DiagnosticType;
  documentation_url?: string;
  show_environment: boolean;
  hints?: string[];
}

/**
 * @alpha
 */
export type DiagnosticType = 'error' | 'warn' | 'info';

// ENTRY STRATEGY ***************

/**
 * @alpha
 */
export type EntryStrategy =
  | SingleEntryStrategy
  | HookEntryStrategy
  | ComponentEntryStrategy
  | SmartEntryStrategy
  | ManualEntryStrategy;

/**
 * @alpha
 */
export type MinifyMode = 'minify' | 'simplify' | 'none';

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

// OUTPUT ENTRY MAP ***************

/**
 * @alpha
 */
export interface OutputEntryMap {}

// PATH UTIL  ***************

/**
 * @alpha
 */
export interface Path {
  resolve(...pathSegments: string[]): string;
  normalize(path: string): string;
  isAbsolute(path: string): boolean;
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  dirname(path: string): string;
  basename(path: string, ext?: string): string;
  extname(path: string): string;
  format(pathObject: Partial<PathObject>): string;
  parse(path: string): PathObject;
  readonly sep: string;
  readonly delimiter: string;
  readonly win32: null;
  readonly posix: Path;
}

/**
 * @alpha
 */
export interface PathObject {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
}
