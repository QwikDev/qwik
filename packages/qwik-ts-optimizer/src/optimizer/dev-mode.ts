/**
 * Dev mode QRL declaration builders and JSX source info.
 *
 * Provides string builders for dev mode transforms:
 * - qrlDEV() declarations with file/lo/hi/displayName metadata
 * - JSX source info objects (fileName, lineNumber, columnNumber)
 * - _useHmr() call injection for component segments
 */

/**
 * Build a qrlDEV const declaration string for dev mode.
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

/**
 * Build the absolute dev file path for qrlDEV metadata.
 *
 * Uses devPath if provided, otherwise constructs from srcDir + "/" + inputPath.
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

