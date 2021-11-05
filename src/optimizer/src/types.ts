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
  minify?: MinifyOption;
  sourceMaps?: SourceMapsOption;
  transpile?: TranspileOption;
}

/**
 * @alpha
 */
export interface TransformInMemoryOptions extends TransformOptions {
  rootDir: string;
  input: TransformCodeInput[];
  outputDir?: string;
}

/**
 * @alpha
 */
export interface TransformFsOptions extends TransformOptions {
  rootDir: string;

  // **/*.qwik.{js,jsx,ts,tsx}
  glob?: string;

  /**
   * The output directory path each output file is set as.
   */
  outputDir?: string;
}

// OPTION INPUTS ***************

/**
 * @alpha
 */
export interface TransformCodeInput {
  path: string;
  code: string;
}

/**
 * @alpha
 */
export interface TransformDirectoryInput {
  path: string;
}

// RESULT ***************

/**
 * @alpha
 */
export interface TransformResult {
  diagnostics: OptimizerDiagnostic[];
  output: TransformedOutput[];
}

// RESULT OUTPUT ***************

/**
 * @alpha
 */
export interface TransformedOutput {
  srcFile: string;
  outFile: string;
  isEntry: boolean;
  code: string;
  map: string;
}

// DIAGNOSTICS ***************

/**
 * @alpha
 */
export interface OptimizerDiagnostic {
  message: string;
  type: OptimizerDiagnosticType;
}

/**
 * @alpha
 */
export type OptimizerDiagnosticType = 'error' | 'warn' | 'info';

// ENTRY STRATEGY ***************

/**
 * @alpha
 */
export type EntryStrategy = SingleEntryStrategy | PerHookEntryStrategy | ManualEntryStrategy;

/**
 * @alpha
 */
export interface SingleEntryStrategy {
  type: 'single';
}

/**
 * @alpha
 */
export interface PerHookEntryStrategy {
  type: 'per-hook';
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
