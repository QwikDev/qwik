import type { PathParams } from './types';

/**
 * Match a given route against a path.
 *
 * @param route Route definition: example: `/path/[param]/[...rest]/`
 * @param path actual path to match
 * @returns Returns PathParams or null if did not match.
 */
export function matchRoute(route: string, path: string): PathParams | null {
  const params: PathParams = {};
  let routeIdx: number = startIdxSkipSlash(route);
  const routeLength = route.length;
  let pathIdx: number = startIdxSkipSlash(path);
  const pathLength = lengthNoTrailingSlash(path);
  while (routeIdx < routeLength) {
    const routeCh = route.charCodeAt(routeIdx++);
    const pathCh = path.charCodeAt(pathIdx++);
    if (routeCh === Char.OPEN_BRACKET) {
      const isRest = isThreeDots(route, routeIdx);
      // EXAMPLE: /path/pre[param]post/
      //                   ^     ^    ^
      //                   |     |    + paramSuffixEnd
      //                   |     + paramNameEnd
      //                   + paramNameStart
      //
      const paramNameStart = routeIdx + (isRest ? 3 : 0);
      const paramNameEnd = scan(route, paramNameStart, routeLength, Char.CLOSE_BRACKET);
      const paramName = route.substring(paramNameStart, paramNameEnd);
      const paramSuffixEnd = scan(route, paramNameEnd + 1, routeLength, Char.SLASH);
      const suffix = route.substring(paramNameEnd + 1, paramSuffixEnd);
      routeIdx = paramNameEnd + 1;
      // VALUE
      const paramValueStart = pathIdx - 1; // -1 because we already consumed the character
      const paramValueEnd = scan(
        path,
        paramValueStart,
        pathLength,
        isRest ? Char.EOL : Char.SLASH,
        suffix
      );
      if (paramValueEnd == -1) {
        return null;
      }
      const paramValue = path.substring(paramValueStart, paramValueEnd);
      if (!isRest && !suffix && !paramValue) {
        // empty value is only allowed with rest or suffix (e.g. '/path/[...rest]' or '/path/[param]suffix')
        return null;
      }
      pathIdx = paramValueEnd;
      params[paramName] = decodeURIComponent(paramValue);
    } else if (routeCh !== pathCh) {
      if (!(isNaN(pathCh) && isRestParameter(route, routeIdx))) {
        return null;
      }
    }
  }
  if (allConsumed(route, routeIdx) && allConsumed(path, pathIdx)) {
    // match if there are no extra parts
    return params;
  } else {
    return null;
  }
}

function isRestParameter(text: string, idx: number): boolean {
  return text.charCodeAt(idx) === Char.OPEN_BRACKET && isThreeDots(text, idx + 1);
}

function lengthNoTrailingSlash(text: string): number {
  const length = text.length;
  return length > 1 && text.charCodeAt(length - 1) === Char.SLASH ? length - 1 : length;
}

function allConsumed(text: string, idx: number): boolean {
  const length = text.length;
  return idx >= length || (idx == length - 1 && text.charCodeAt(idx) === Char.SLASH);
}

function startIdxSkipSlash(text: string): 0 | 1 {
  return text.charCodeAt(0) === Char.SLASH ? 1 : 0;
}

function isThreeDots(text: string, idx: number): boolean {
  return (
    text.charCodeAt(idx) === Char.DOT &&
    text.charCodeAt(idx + 1) === Char.DOT &&
    text.charCodeAt(idx + 2) === Char.DOT
  );
}

function scan(text: string, idx: number, length: number, ch: Char, suffix: string = ''): number {
  while (idx < length && text.charCodeAt(idx) !== ch) {
    idx++;
  }
  const suffixLength = suffix.length;
  for (let i = 0; i < suffixLength; i++) {
    if (text.charCodeAt(idx - suffixLength + i) !== suffix.charCodeAt(i)) {
      return -1;
    }
  }
  return idx - suffixLength;
}

const enum Char {
  EOL = 0,
  OPEN_BRACKET = 91, // '['
  CLOSE_BRACKET = 93, // ']'
  DOT = 46, // '.'
  SLASH = 47, // '/'
}
