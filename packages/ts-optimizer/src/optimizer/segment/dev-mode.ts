export interface NoopQrlDevMeta {
  file: string;
  lo: number;
  hi: number;
  displayName: string;
}

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

export function buildQrlDevDeclaration(
  symbolName: string,
  canonicalFilename: string,
  devFile: string,
  lo: number,
  hi: number,
  displayName: string,
  explicitExtension?: string
): string {
  const ext = explicitExtension ?? '';
  const devMeta = formatDevMeta({ file: devFile, lo, hi, displayName });
  return `const q_${symbolName} = /*#__PURE__*/ qrlDEV(()=>import("./${canonicalFilename}${ext}"), "${symbolName}", ${devMeta});`;
}

export function buildDevFilePath(inputPath: string, srcDir: string, devPath?: string): string {
  if (devPath) return devPath;
  const normalizedInput = inputPath.startsWith('./') ? inputPath.slice(2) : inputPath;
  if (normalizedInput.startsWith('/')) return normalizedInput;
  const normalizedSrcDir = srcDir.endsWith('/') ? srcDir.slice(0, -1) : srcDir;
  return `${normalizedSrcDir}/${normalizedInput}`;
}
