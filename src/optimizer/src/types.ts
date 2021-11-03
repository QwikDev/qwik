// OPTIONS ***************

export type MinifyOption = boolean | undefined | null;

export type SourceMapsOption = boolean | undefined | null;

export type TranspileOption = boolean | undefined | null;

interface TransformOptions {
  entryStrategy?: EntryStrategy;
  minify?: MinifyOption;
  sourceMaps?: SourceMapsOption;
  transpile?: TranspileOption;
}

export interface TransformCodeOptions extends TransformOptions {
  input: TransformCodeInput[];
}

export interface TransformDirectoryOptions extends TransformOptions {
  inputDir: string;

  // **/*.qwik.{js,jsx,ts,tsx}
  glob?: string;

  /**
   * The output directory path each output file is set as.
   */
  outputDir?: string;
}

// OPTION INPUTS ***************

export interface TransformCodeInput {
  path: string;
  code: string;
}

export interface TransformDirectoryInput {
  path: string;
}

// RESULT ***************

export interface TransformResult {
  diagnostics: OptimizerDiagnostic[];
  output: TransformedOutput[];
}

// RESULT OUTPUT ***************

export interface TransformedOutput {
  srcFile: string;
  outFile: string;
  isEntry: boolean;
  code?: string;
  map?: string;
}

// DIAGNOSTICS ***************

export interface OptimizerDiagnostic {
  message: string;
  type: OptimizerDiagnosticType;
}

export type OptimizerDiagnosticType = 'error' | 'warn' | 'info';

// ENTRY STRATEGY ***************

export type EntryStrategy = SingleEntryStrategy | PerHookEntryStrategy | ManualEntryStrategy;

export interface SingleEntryStrategy {
  type: 'single';
}

export interface PerHookEntryStrategy {
  type: 'per-hook';
}

export interface ManualEntryStrategy {
  type: 'manual';
  entries: string[][];
}

// OUTPUT ENTRY MAP ***************

export interface OutputEntryMap {}
