/**
 * Dev mode QRL declaration builders and JSX source info.
 *
 * Provides string builders for dev mode transforms:
 * - qrlDEV() declarations with file/lo/hi/displayName metadata
 * - JSX source info objects (fileName, lineNumber, columnNumber)
 * - _useHmr() call injection for component segments
 */

export interface NoopQrlDevMeta {
  file: string;
  lo: number;
  hi: number;
  displayName: string;
}

/** The `{ file, lo, hi, displayName }` dev-metadata object literal shared by the qrlDEV / _noopQrlDEV builders. */
export function formatDevMeta(meta: NoopQrlDevMeta): string {
  return (
    `{\n` +
    `    file: "${meta.file}",\n` +
    `    lo: ${meta.lo},\n` +
    `    hi: ${meta.hi},\n` +
    `    displayName: "${meta.displayName}"\n` +
    `}`
  );
}

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
  const devMeta = formatDevMeta({ file: devFile, lo, hi, displayName });
  return `const q_${symbolName} = /*#__PURE__*/ qrlDEV(()=>import("./${canonicalFilename}${ext}"), "${symbolName}", ${devMeta});`;
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
  const normalizedInput = inputPath.startsWith('./') ? inputPath.slice(2) : inputPath;
  if (normalizedInput.startsWith('/')) return normalizedInput;
  const normalizedSrcDir = srcDir.endsWith('/') ? srcDir.slice(0, -1) : srcDir;
  return `${normalizedSrcDir}/${normalizedInput}`;
}

