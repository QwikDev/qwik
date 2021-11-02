// OPTIONS ***************

export type MinifyOption = boolean | undefined | null;

export type SourceMapsOption = boolean | undefined | null;

export type TranspileOption = boolean | undefined | null;

interface TransformOptions {
  minify?: MinifyOption;
  sourceMaps?: SourceMapsOption;
  transpile?: TranspileOption;
}

export interface TransformCodeOptions extends TransformOptions {
  input: TransformCodeInput[];
}

export interface TransformFileOptions extends TransformOptions {
  input: TransformFileInput[];
  /**
   * The output directory path each output file is set as. Use the
   * `write` option to also write the contents to this output directory.
   */
  outDir: string;
  /**
   * Continue to drill down recursively if an input path is a directory.
   */
  recursiveDir?: boolean;
  /**
   * Set to `true` to write the files to the `outDir`, otherwise the result
   * output will include `code` and `map` properties.
   */
  write?: boolean;
}

// OPTION INPUTS ***************

export interface TransformCodeInput {
  filename: string;
  code: string;
}

export interface TransformFileInput {
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
  code?: string;
  map?: string;
}

// DIAGNOSTICS ***************

export interface OptimizerDiagnostic {
  message: string;
  type: OptimizerDiagnosticType;
}

export type OptimizerDiagnosticType = 'error' | 'warn' | 'info';

// MANIFEST ***************

export interface ManifestFile {
  exports: string[];
}

export interface Manifest {
  files: { [path: string]: ManifestFile };
}
