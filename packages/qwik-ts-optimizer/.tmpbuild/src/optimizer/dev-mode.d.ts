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
export declare function buildQrlDevDeclaration(symbolName: string, canonicalFilename: string, devFile: string, lo: number, hi: number, displayName: string, explicitExtension?: string): string;
/**
 * Build the absolute dev file path for qrlDEV metadata.
 *
 * Uses devPath if provided, otherwise constructs from srcDir + "/" + inputPath.
 */
export declare function buildDevFilePath(inputPath: string, srcDir: string, devPath?: string): string;
/**
 * Build a JSX dev source info object literal string.
 * lineNumber and columnNumber are 1-indexed.
 */
export declare function buildJsxSourceInfo(fileName: string, lineNumber: number, columnNumber: number): string;
/**
 * Build _useHmr() call string for component segment injection in dev mode.
 */
export declare function buildUseHmrCall(filePath: string): string;
//# sourceMappingURL=dev-mode.d.ts.map