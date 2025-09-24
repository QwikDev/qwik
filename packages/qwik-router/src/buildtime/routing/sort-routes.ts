import type { BuiltRoute } from '../types';

/** Sort routes by pathname, then by extension. Longer routes are sorted first. */
export function routeSortCompare(a: BuiltRoute, b: BuiltRoute) {
  const maxSegments = Math.max(a.segments.length, b.segments.length);

  for (let i = 0; i < maxSegments; i += 1) {
    const sa = a.segments[i];
    const sb = b.segments[i];

    // /x < /x/y, but /[...x]/y < /[...x]
    if (!sa) {
      return a.pathname.includes('[...') ? 1 : -1;
    }
    if (!sb) {
      return b.pathname.includes('[...') ? -1 : 1;
    }

    const maxParts = Math.max(sa.length, sb.length);
    for (let i = 0; i < maxParts; i += 1) {
      const pa = sa[i];
      const pb = sb[i];

      // xy < x[y], but [x].json < [x]
      if (pa === undefined) {
        return pb.dynamic ? -1 : 1;
      }
      if (pb === undefined) {
        return pa.dynamic ? 1 : -1;
      }

      // x < [x]
      if (pa.dynamic !== pb.dynamic) {
        return pa.dynamic ? 1 : -1;
      }

      if (pa.dynamic) {
        // [x] < [...x]
        if (pa.rest !== pb.rest) {
          return pa.rest ? 1 : -1;
        }
      }
    }
  }

  if (a.pathname === b.pathname) {
    return a.ext > b.ext ? -1 : 1;
  }

  return a.pathname < b.pathname ? -1 : 1;
}
