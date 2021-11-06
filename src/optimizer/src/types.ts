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
export type EntryStrategy = SingleEntryStrategy | PerHookEntryStrategy | ManualEntryStrategy;

/**
 * @alpha
 */
 export type MinifyMode = 'minify' | 'simplify' | 'none';

/**
 * @alpha
 */
export interface SingleEntryStrategy {
  type: 'Single';
}

/**
 * @alpha
 */
export interface PerHookEntryStrategy {
  type: 'PerHook';
}

/**
 * @alpha
 */
export interface ManualEntryStrategy {
  type: 'Manual';
  entries: string[][];
}

// OUTPUT ENTRY MAP ***************

/**
 * @alpha
 */
export interface OutputEntryMap {}
