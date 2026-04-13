/**
 * Shared path string helpers for optimizer transforms.
 *
 * These utilities intentionally operate on normalized string paths to match
 * the existing optimizer behavior and keep path handling deterministic across
 * platforms.
 */
import { basename, dirname, extname, normalize, normalizeString, relative } from 'pathe';

/** Determine file extension from a path string. */
export function getExtension(filePath: string): string {
  return extname(normalizePath(filePath));
}

/** Strip file extension from a path string. */
export function stripExtension(filePath: string): string {
  const normalized = normalizePath(filePath);
  const extension = extname(normalized);
  if (!extension) return normalized;
  return normalized.slice(0, -extension.length);
}

/** Get the basename component from a slash-delimited path string. */
export function getBasename(filePath: string): string {
  return basename(normalizePath(filePath));
}

/** Get the directory component from a slash-delimited path string. */
export function getDirectory(filePath: string): string {
  const dir = dirname(normalizePath(filePath));
  return dir === '.' ? '' : dir;
}

/** Get the basename without its extension. */
export function getFileStem(filePath: string): string {
  return stripExtension(getBasename(filePath));
}

/** Normalize a path string to use forward slashes. */
export function normalizePath(filePath: string): string {
  return normalize(filePath);
}

/**
 * Compute relative path from srcDir. If path doesn't start with srcDir,
 * returns the path as-is (normalized).
 */
export function computeRelPath(inputPath: string, srcDir: string): string {
  const normInput = normalizePath(inputPath);
  const normSrc = normalizePath(srcDir);

  if (normSrc === '.' || normSrc === '' || normSrc === './') {
    return normInput;
  }

  const rel = relative(normSrc, normInput);
  if (rel !== '' && rel !== '.' && rel !== '..' && !rel.startsWith('../')) {
    return rel;
  }

  return normInput;
}

/**
 * Check whether a relative import path stays within the srcDir-relative tree
 * when resolved from a file's relative path.
 */
export function isRelativePathInsideBase(relativePath: string, importerPath: string): boolean {
  if (!relativePath.startsWith('.')) return false;

  const importerDir = getDirectory(normalizePath(importerPath));
  const combined = importerDir ? `${importerDir}/${relativePath}` : relativePath;
  const normalized = normalizeString(normalizePath(combined), true);

  return normalized !== '..' && !normalized.startsWith('../');
}

/**
 * Compute the parent module path for segment imports back to the parent module.
 * Segments are always emitted in the same directory as the parent file,
 * so we use only the basename (no directory component), prefixed with "./".
 */
export function computeParentModulePath(
  relPath: string,
  explicitExtensions?: boolean,
): string {
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
export function computeOutputExtension(
  sourceExt: string,
  transpileTs?: boolean,
  transpileJsx?: boolean,
): string {
  if (transpileTs) return '.js';
  if (transpileJsx) return '.ts';
  return sourceExt;
}
