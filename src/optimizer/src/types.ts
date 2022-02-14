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
  explicityExtensions?: boolean;
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
export interface OutputEntryMap {
  version: string;
  injections?: GlobalInjections[];
  mapping: { [canonicalName: string]: string };
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
