import { ensureSlash } from '../../utils/pathname';

// New per-loader/per-action URL patterns
export const IsQLoader = '@isQLoader';
export const IsQAction = '@isQAction';
export const QLoaderId = '@loaderId';
export const QActionId = '@actionId';

/** Matches `/q-loader-{loaderId}.{manifestHash}.json` */
export const LOADER_REGEX = /\/(q-loader-([^.]+)\.([^.]+)\.json)$/;

export const getLoaderName = (loaderId: string, manifestHash: string) =>
  `q-loader-${loaderId}.${manifestHash}.json`;

export type RecognizedRequest = {
  type: typeof IsQLoader;
  trimLength: number;
  data: { loaderId?: string; manifestHash?: string } | null;
};

/**
 * Recognize internal request types from the URL pathname.
 *
 * Returns the request type, how many characters to trim from the pathname, and any extracted data
 * (e.g. loaderId for loader requests).
 */
export function recognizeRequest(pathname: string): RecognizedRequest | null {
  // Quick length check for common cases
  if (pathname.length < 10) {
    return null;
  }

  // Check for per-loader pattern: /q-loader-{loaderId}.{manifestHash}.json
  const loaderMatch = pathname.match(LOADER_REGEX);
  if (loaderMatch) {
    return {
      type: IsQLoader,
      trimLength: loaderMatch[1].length + 1, // +1 for the leading /
      data: { loaderId: loaderMatch[2], manifestHash: loaderMatch[3] },
    };
  }

  return null;
}

/** Trim a recognized internal URL suffix from a pathname, returning the clean route pathname. */
export function trimRecognizedInternalPathname(
  pathname: string,
  recognized: RecognizedRequest
): string {
  let trimmed = pathname.slice(0, pathname.length - recognized.trimLength) || '/';
  if (!globalThis.__NO_TRAILING_SLASH__ && !trimmed.endsWith('/')) {
    trimmed = ensureSlash(trimmed);
  }
  return trimmed;
}

/** Trim any recognized internal URL suffix from a pathname, returning the clean route pathname. */
export function trimInternalPathname(pathname: string): string {
  const recognized = recognizeRequest(pathname);
  if (recognized) {
    return trimRecognizedInternalPathname(pathname, recognized);
  }
  return pathname;
}
