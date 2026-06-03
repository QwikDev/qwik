/**
 * Shared path string helpers for optimizer transforms.
 *
 * These utilities intentionally operate on normalized string paths to match
 * the existing optimizer behavior and keep path handling deterministic across
 * platforms.
 */
import { basename, dirname, extname, normalize, normalizeString, relative } from 'pathe';
import {
  type FilePath,
  type RelativePath,
  mkRelativePath,
} from './types/brands.js';

// path-utils functions: the high-level entry points (`computeRelPath`,
// `computeParentModulePath`, `computeOutputExtension`) take/return branded
// path types because their contracts encode real semantic distinctions
// (FilePath = arbitrary path; RelativePath = no-leading-slash). The
// low-level string manipulators below (`getBasename`, `getDirectory`,
// `getExtension`, etc.) accept plain `string` — they work on any
// path-shaped input by design, and branding them just forces casts at
// every consumer with no type-safety win.

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
 * returns a normalized form with any leading `/` stripped — the contract
 * is that the returned value is always usable where a relative path is
 * expected (no leading slash). This matches `RelativePath`'s shape rule
 * in `types/brands.ts` so the result can be branded without per-fallback
 * special-casing at consumers.
 *
 * Preserves a leading `./` from the input when present. SWC's hash
 * function uses the user-provided path shape (e.g. `./node_modules/x`
 * stays as `./node_modules/x`), and the JSX dev-info `fileName:`
 * emission also expects that shape. Stripping `./` via `normalize()`
 * would produce TS-vs-SWC hash divergence + dev-info path divergence
 * for `node_modules`-prefixed fixtures. Stripping the `./` for
 * absolute-path concatenation happens at the call site
 * (`buildDevFilePath`).
 */
export function computeRelPath(inputPath: FilePath, srcDir: FilePath): RelativePath {
  const hasLeadingDotSlash = (inputPath as string).startsWith('./');
  const normInput = normalizePath(inputPath);
  const normSrc = normalizePath(srcDir);

  if (normSrc === '.' || normSrc === '' || normSrc === './') {
    return mkRelativePath(restoreDotSlash(stripLeadingSlash(normInput), hasLeadingDotSlash));
  }

  const rel = relative(normSrc, normInput);
  if (rel !== '' && rel !== '.' && rel !== '..' && !rel.startsWith('../')) {
    return mkRelativePath(restoreDotSlash(rel, hasLeadingDotSlash));
  }

  return mkRelativePath(restoreDotSlash(stripLeadingSlash(normInput), hasLeadingDotSlash));
}

/** If the original input had a leading `./` prefix, restore it on the
 * normalized output (unless the normalized form already has it or is
 * empty). */
function restoreDotSlash(normalized: string, hadDotSlashPrefix: boolean): string {
  if (!hadDotSlashPrefix) return normalized;
  if (normalized.startsWith('./')) return normalized;
  if (normalized === '' || normalized.startsWith('/')) return normalized;
  return './' + normalized;
}

function stripLeadingSlash(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

/**
 * Check whether a relative import path stays within the srcDir-relative tree
 * when resolved from a file's relative path.
 *
 * `relativePath` is an import-specifier string (e.g. `./foo`, `../bar`),
 * gate-checked on entry. `importerPath` is the source file's
 * project-relative path.
 */
export function isRelativePathInsideBase(relativePath: string, importerPath: RelativePath): boolean {
  if (!relativePath.startsWith('.')) return false;

  const importerDir = getDirectory(importerPath);
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
  relPath: RelativePath,
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
