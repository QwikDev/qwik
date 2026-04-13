/**
 * Dev mode QRL declaration builders and JSX source info.
 *
 * Provides string builders for dev mode transforms:
 * - qrlDEV() declarations with file/lo/hi/displayName metadata
 * - JSX source info objects (fileName, lineNumber, columnNumber)
 * - _useHmr() call injection for component segments
 *
 * Implements: MODE-01, MODE-02, MODE-03
 */

// ---------------------------------------------------------------------------
// QRL dev declaration
// ---------------------------------------------------------------------------

/**
 * Build a qrlDEV const declaration string for dev mode.
 *
 * Format (verified from example_dev_mode snapshot):
 * ```
 * const q_{symbolName} = /*#__PURE__* / qrlDEV(()=>import("./{canonicalFilename}"), "{symbolName}", {
 *     file: "{devFile}",
 *     lo: {lo},
 *     hi: {hi},
 *     displayName: "{displayName}"
 * });
 * ```
 */
export function buildQrlDevDeclaration(
  symbolName: string,
  canonicalFilename: string,
  devFile: string,
  lo: number,
  hi: number,
  displayName: string,
  explicitExtension?: string,
): string {
  const ext = explicitExtension ?? '';
  return (
    `const q_${symbolName} = /*#__PURE__*/ qrlDEV(()=>import("./${canonicalFilename}${ext}"), "${symbolName}", {\n` +
    `    file: "${devFile}",\n` +
    `    lo: ${lo},\n` +
    `    hi: ${hi},\n` +
    `    displayName: "${displayName}"\n` +
    `});`
  );
}

// ---------------------------------------------------------------------------
// Dev file path
// ---------------------------------------------------------------------------

/**
 * Build the absolute dev file path for qrlDEV metadata.
 *
 * Uses devPath if provided (from TransformModuleInput), otherwise
 * constructs from srcDir + "/" + inputPath.
 */
export function buildDevFilePath(
  inputPath: string,
  srcDir: string,
  devPath?: string,
): string {
  if (devPath) return devPath;
  const normalizedSrcDir = srcDir.endsWith('/') ? srcDir.slice(0, -1) : srcDir;
  return `${normalizedSrcDir}/${inputPath}`;
}

// ---------------------------------------------------------------------------
// JSX source info
// ---------------------------------------------------------------------------

/**
 * Build the JSX dev source info object literal string.
 *
 * Format (verified from example_jsx_keyed_dev snapshot):
 * ```
 * {
 *     fileName: "{fileName}",
 *     lineNumber: {lineNumber},
 *     columnNumber: {columnNumber}
 * }
 * ```
 *
 * fileName uses the relative file path (not absolute).
 * lineNumber and columnNumber are 1-indexed.
 */
export function buildJsxSourceInfo(
  fileName: string,
  lineNumber: number,
  columnNumber: number,
): string {
  return (
    `{\n` +
    `    fileName: "${fileName}",\n` +
    `    lineNumber: ${lineNumber},\n` +
    `    columnNumber: ${columnNumber}\n` +
    `}`
  );
}

// ---------------------------------------------------------------------------
// HMR injection
// ---------------------------------------------------------------------------

/**
 * Build _useHmr() call string for component segment injection in dev mode.
 *
 * TODO: No snapshot evidence found for _useHmr behavior. This is a
 * best-effort implementation based on Qwik source. Verify when snapshot
 * evidence becomes available.
 */
export function buildUseHmrCall(filePath: string): string {
  return `_useHmr("${filePath}");`;
}
