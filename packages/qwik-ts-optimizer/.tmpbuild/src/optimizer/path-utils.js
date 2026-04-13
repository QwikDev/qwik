/**
 * Shared path string helpers for optimizer transforms.
 *
 * These utilities intentionally operate on normalized string paths to match
 * the existing optimizer behavior and keep path handling deterministic across
 * platforms.
 */
/** Determine file extension from a path string. */
export function getExtension(filePath) {
    const dotIdx = filePath.lastIndexOf('.');
    if (dotIdx >= 0)
        return filePath.slice(dotIdx);
    return '';
}
/** Strip file extension from a path string. */
export function stripExtension(filePath) {
    const dotIdx = filePath.lastIndexOf('.');
    if (dotIdx >= 0)
        return filePath.slice(0, dotIdx);
    return filePath;
}
/** Get the basename component from a slash-delimited path string. */
export function getBasename(filePath) {
    const slashIdx = filePath.lastIndexOf('/');
    return slashIdx >= 0 ? filePath.slice(slashIdx + 1) : filePath;
}
/** Get the directory component from a slash-delimited path string. */
export function getDirectory(filePath) {
    const slashIdx = filePath.lastIndexOf('/');
    return slashIdx >= 0 ? filePath.slice(0, slashIdx) : '';
}
/** Get the basename without its extension. */
export function getFileStem(filePath) {
    return stripExtension(getBasename(filePath));
}
/** Normalize a path string to use forward slashes. */
export function normalizePath(filePath) {
    return filePath.split('\\').join('/');
}
/**
 * Compute relative path from srcDir. If path doesn't start with srcDir,
 * returns the path as-is (normalized).
 */
export function computeRelPath(inputPath, srcDir) {
    const normInput = normalizePath(inputPath);
    const normSrc = normalizePath(srcDir);
    if (normSrc === '.' || normSrc === '' || normSrc === './') {
        return normInput;
    }
    const prefix = normSrc.endsWith('/') ? normSrc : normSrc + '/';
    if (normInput.startsWith(prefix)) {
        return normInput.slice(prefix.length);
    }
    return normInput;
}
/**
 * Compute the parent module path for segment imports back to the parent module.
 * Segments are always emitted in the same directory as the parent file,
 * so we use only the basename (no directory component), prefixed with "./".
 */
export function computeParentModulePath(relPath, explicitExtensions) {
    const basename = getBasename(relPath);
    if (explicitExtensions) {
        return './' + basename;
    }
    return './' + stripExtension(basename);
}
/**
 * Compute the output file extension for QRL imports based on transpilation settings.
 * - transpileTs (with or without transpileJsx): .js (TypeScript fully stripped)
 * - transpileJsx only (no transpileTs): .ts (JSX gone, TS remains)
 * - neither: use source extension (.tsx, .ts, etc.)
 */
export function computeOutputExtension(sourceExt, transpileTs, transpileJsx) {
    if (transpileTs)
        return '.js';
    if (transpileJsx)
        return '.ts';
    return sourceExt;
}
//# sourceMappingURL=path-utils.js.map