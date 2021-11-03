import type {
  OptimizerDiagnostic,
  TransformCodeOptions,
  TransformDirectoryOptions,
  TransformResult,
} from '.';

/**
 * Transforms the input code string, does not access the file system.
 */
export async function transformCode(opts: TransformCodeOptions) {
  const result: TransformResult = {
    output: [],
    diagnostics: [],
  };
  try {
    // napi!!!!
  } catch (e) {
    catchDiagnostics(result.diagnostics, e);
  }
  return result;
}

/**
 * Transforms the input code string, does not access the file system.
 */
export function transformCodeSync(opts: TransformCodeOptions) {
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
export async function transformDirectory(opts: TransformDirectoryOptions) {
  const result: TransformResult = {
    output: [],
    diagnostics: [],
  };
  try {
    // napi!!
  } catch (e) {
    catchDiagnostics(result.diagnostics, e);
  }
  return result;
}

/**
 * Transforms the file read from the file system.
 */
export function transformDirectorySync(opts: TransformDirectoryOptions) {
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

function catchDiagnostics(diagnostics: OptimizerDiagnostic[], err: any) {
  diagnostics.push({ type: 'error', message: String(err.stack || err) });
}
