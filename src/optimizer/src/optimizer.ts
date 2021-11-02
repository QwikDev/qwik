import type {
  TransformCodeOptions,
  TransformFileOptions,
  OptimizerDiagnostic,
  TransformResult,
} from './types';

export class Optimizer {
  /**
   * Transforms the input code string, does not access the file system.
   */
  async transformCode(opts: TransformCodeOptions) {
    const result: TransformResult = {
      output: [],
      diagnostics: [],
    };
    try {
    } catch (e) {
      catchDiagnostics(result.diagnostics, e);
    }
    return result;
  }

  /**
   * Transforms the input code string, does not access the file system.
   */
  transformCodeSync(opts: TransformCodeOptions) {
    const result: TransformResult = {
      output: [],
      diagnostics: [],
    };
    try {
    } catch (e) {
      catchDiagnostics(result.diagnostics, e);
    }
    return result;
  }

  /**
   * Transforms the file read from the file system.
   */
  async transform(opts: TransformFileOptions) {
    const result: TransformResult = {
      output: [],
      diagnostics: [],
    };
    try {
    } catch (e) {
      catchDiagnostics(result.diagnostics, e);
    }
    return result;
  }

  /**
   * Transforms the file read from the file system.
   */
  transformSync(opts: TransformFileOptions) {
    const result: TransformResult = {
      output: [],
      diagnostics: [],
    };
    try {
    } catch (e) {
      catchDiagnostics(result.diagnostics, e);
    }
    return result;
  }
}

function catchDiagnostics(diagnostics: OptimizerDiagnostic[], err: any) {
  diagnostics.push({ type: 'error', message: String(err.stack || err) });
}
