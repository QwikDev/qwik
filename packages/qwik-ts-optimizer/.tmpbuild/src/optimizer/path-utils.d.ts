/**
 * Shared path string helpers for optimizer transforms.
 *
 * These utilities intentionally operate on normalized string paths to match
 * the existing optimizer behavior and keep path handling deterministic across
 * platforms.
 */
/** Determine file extension from a path string. */
export declare function getExtension(filePath: string): string;
/** Strip file extension from a path string. */
export declare function stripExtension(filePath: string): string;
/** Get the basename component from a slash-delimited path string. */
export declare function getBasename(filePath: string): string;
/** Get the directory component from a slash-delimited path string. */
export declare function getDirectory(filePath: string): string;
/** Get the basename without its extension. */
export declare function getFileStem(filePath: string): string;
/** Normalize a path string to use forward slashes. */
export declare function normalizePath(filePath: string): string;
/**
 * Compute relative path from srcDir. If path doesn't start with srcDir,
 * returns the path as-is (normalized).
 */
export declare function computeRelPath(inputPath: string, srcDir: string): string;
/**
 * Compute the parent module path for segment imports back to the parent module.
 * Segments are always emitted in the same directory as the parent file,
 * so we use only the basename (no directory component), prefixed with "./".
 */
export declare function computeParentModulePath(relPath: string, explicitExtensions?: boolean): string;
/**
 * Compute the output file extension for QRL imports based on transpilation settings.
 * - transpileTs (with or without transpileJsx): .js (TypeScript fully stripped)
 * - transpileJsx only (no transpileTs): .ts (JSX gone, TS remains)
 * - neither: use source extension (.tsx, .ts, etc.)
 */
export declare function computeOutputExtension(sourceExt: string, transpileTs?: boolean, transpileJsx?: boolean): string;
//# sourceMappingURL=path-utils.d.ts.map