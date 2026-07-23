/**
 * Shared path-string helpers. Operate on normalized string paths for deterministic cross-platform
 * behavior.
 */
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  normalize,
  normalizeString,
  relative,
} from 'pathe';
import { type FilePath, type RelativePath, mkRelativePath } from './optimizer/types/brands.js';

// High-level entry points (`computeRelPath`, `computeParentModulePath`,
// `computeOutputExtension`) take/return branded path types; the low-level string
// helpers below accept plain `string` — branding them would force casts at every
// consumer with no type-safety win.

export function getExtension(filePath: string): string {
  return extname(normalizePath(filePath));
}

export function stripExtension(filePath: string): string {
  const normalized = normalizePath(filePath);
  const extension = extname(normalized);
  if (!extension) return normalized;
  return normalized.slice(0, -extension.length);
}

export function getBasename(filePath: string): string {
  return basename(normalizePath(filePath));
}

export function getDirectory(filePath: string): string {
  const dir = dirname(normalizePath(filePath));
  return dir === '.' ? '' : dir;
}

export function getFileStem(filePath: string): string {
  return stripExtension(getBasename(filePath));
}

export function normalizePath(filePath: string): string {
  return normalize(filePath);
}

/**
 * Compute the relative path from srcDir. When the path is outside srcDir, returns a normalized form
 * with any leading `/` stripped, so the result is always usable as a relative path (no leading
 * slash) — matching `RelativePath`'s shape rule.
 *
 * A leading `./` from the input is preserved: the hash function and the JSX dev-info `fileName:`
 * emission both key off the user-provided path shape (e.g. `./node_modules/x` must stay
 * `./node_modules/x`), so stripping it would shift hashes and dev-info paths for
 * `node_modules`-prefixed inputs. Stripping the `./` for absolute-path concatenation happens at the
 * call site.
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

  // Input lives outside srcDir. When both operands are absolute, `relative()`
  // yields a well-formed `../`-prefixed path (e.g. a `node_modules` lib above the
  // project root). Preserving that shape matters for the bundler: it anchors a
  // segment's own relative imports against `origin`, and a slash-stripped absolute
  // path resolves to garbage. `relative()` is only trustworthy with two absolute
  // operands; a relative operand makes its result cwd-dependent, so those cases
  // fall through to preserving the input verbatim.
  if (isAbsolute(normInput) && isAbsolute(normSrc) && rel.startsWith('..')) {
    return mkRelativePath(restoreDotSlash(rel, hasLeadingDotSlash));
  }

  return mkRelativePath(restoreDotSlash(stripLeadingSlash(normInput), hasLeadingDotSlash));
}

function restoreDotSlash(normalized: string, hadDotSlashPrefix: boolean): string {
  if (!hadDotSlashPrefix) return normalized;
  if (normalized.startsWith('./')) return normalized;
  if (normalized === '' || normalized.startsWith('/')) return normalized;
  return './' + normalized;
}

function stripLeadingSlash(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function isRelativePathInsideBase(
  relativePath: string,
  importerPath: RelativePath
): boolean {
  if (!relativePath.startsWith('.')) return false;

  const importerDir = getDirectory(importerPath);
  const combined = importerDir ? `${importerDir}/${relativePath}` : relativePath;
  const normalized = normalizeString(normalizePath(combined), true);

  return normalized !== '..' && !normalized.startsWith('../');
}

/**
 * Compute the parent module path for a segment's import back to the parent. Segments are emitted in
 * the same directory as the parent, so only the basename is used (prefixed with `./`).
 */
export function computeParentModulePath(
  relPath: RelativePath,
  explicitExtensions?: boolean
): string {
  const basename = getBasename(relPath);
  if (explicitExtensions) {
    return './' + basename;
  }
  return './' + stripExtension(basename);
}

/**
 * Output file extension for QRL imports: `.js` when TS is transpiled (fully stripped), `.ts` when
 * only JSX is transpiled (TS remains), else the source extension.
 */
export function computeOutputExtension(
  sourceExt: string,
  transpileTs?: boolean,
  transpileJsx?: boolean
): string {
  if (transpileTs) return '.js';
  if (transpileJsx) return '.ts';
  return sourceExt;
}
