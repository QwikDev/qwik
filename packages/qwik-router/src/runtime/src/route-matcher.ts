import type { PathParams } from './types';

/**
 * Match a given route against a path.
 *
 * @param route Route definition: example: `/path/[param]/[...rest]/`
 * @param path Actual path to match
 * @returns Returns PathParams or null if did not match.
 */
export function matchRoute(route: string, path: string): PathParams | null {
  const routeIdx: number = startIdxSkipSlash(route);
  const routeLength = lengthNoTrailingSlash(route);
  const pathIdx: number = startIdxSkipSlash(path);
  const pathLength = lengthNoTrailingSlash(path);
  return matchRoutePart(route, routeIdx, routeLength, path, pathIdx, pathLength);
}

function matchRoutePart(
  route: string,
  routeIdx: number,
  routeLength: number,
  path: string,
  pathIdx: number,
  pathLength: number
): PathParams | null {
  if (path.startsWith('/build/')) {
    return null;
  }

  let params: PathParams | null = null;
  while (routeIdx < routeLength) {
    const routeCh = route.charCodeAt(routeIdx++);
    const pathCh = path.charCodeAt(pathIdx++);
    if (routeCh === Char.OPEN_BRACKET) {
      const isMany = isThreeDots(route, routeIdx);
      // EXAMPLE: /path/pre[param]post/
      //                   ^     ^    ^
      //                   |     |    + paramSuffixEnd
      //                   |     + paramNameEnd
      //                   + paramNameStart
      //
      const paramNameStart = routeIdx + (isMany ? 3 : 0);
      const paramNameEnd = scan(route, paramNameStart, routeLength, Char.CLOSE_BRACKET);
      const paramName = route.substring(paramNameStart, paramNameEnd);
      const paramSuffixEnd = scan(route, paramNameEnd + 1, routeLength, Char.SLASH);
      const suffix = route.substring(paramNameEnd + 1, paramSuffixEnd);
      routeIdx = paramNameEnd + 1;
      // VALUE
      const paramValueStart = pathIdx - 1; // -1 because we already consumed the character
      if (isMany) {
        const match = recursiveScan(
          paramName,
          suffix,
          path,
          paramValueStart,
          pathLength,
          route,
          routeIdx + suffix.length + 1,
          routeLength
        );
        if (match) {
          return Object.assign(params || (params = {}), match);
        }
      }
      const paramValueEnd = scan(path, paramValueStart, pathLength, Char.SLASH, suffix);
      if (paramValueEnd == -1) {
        return null;
      }
      const paramValue = path.substring(paramValueStart, paramValueEnd);
      if (!isMany && !suffix && !paramValue) {
        // empty value is only allowed with rest or suffix (e.g. '/path/[...rest]' or '/path/[param]suffix')
        return null;
      }
      pathIdx = paramValueEnd;
      (params || (params = {}))[paramName] = decodeURIComponent(paramValue);
    } else if (routeCh !== pathCh) {
      if (!(isNaN(pathCh) && isRestParameter(route, routeIdx))) {
        return null;
      }
    }
  }
  if (allConsumed(route, routeIdx) && allConsumed(path, pathIdx)) {
    // match if there are no extra parts
    return params || {};
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

function scan(text: string, idx: number, end: number, ch: Char, suffix: string = ''): number {
  while (idx < end && text.charCodeAt(idx) !== ch) {
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
function recursiveScan(
  paramName: string,
  suffix: string,
  path: string,
  pathStart: number,
  pathLength: number,
  route: string,
  routeStart: number,
  routeLength: number
) {
  if (path.charCodeAt(pathStart) === Char.SLASH) {
    pathStart++;
  }
  let pathIdx = pathLength;
  const sep = suffix + '/';
  while (pathIdx >= pathStart) {
    const match = matchRoutePart(route, routeStart, routeLength, path, pathIdx, pathLength);
    if (match) {
      let value = path.substring(pathStart, Math.min(pathIdx, pathLength));
      if (value.endsWith(sep)) {
        value = value.substring(0, value.length - sep.length);
      }
      match[paramName] = decodeURIComponent(value);
      return match;
    }
    const newPathIdx = lastIndexOf(path, pathStart, sep, pathIdx, pathStart - 1) + sep.length;
    if (pathIdx === newPathIdx) {
      break;
    }
    pathIdx = newPathIdx;
  }
  return null;
}

function lastIndexOf(
  text: string,
  start: number,
  match: string,
  searchIdx: number,
  notFoundIdx: number
): number {
  let idx = text.lastIndexOf(match, searchIdx);
  if (idx == searchIdx - match.length) {
    // If previous match was right upto the separator, then try to find the match before that.
    idx = text.lastIndexOf(match, searchIdx - match.length - 1);
  }
  return idx > start ? idx : notFoundIdx;
}
