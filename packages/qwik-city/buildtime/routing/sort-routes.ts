import type { BuildRoute } from '../types';

export function sortRoutes(a: BuildRoute, b: BuildRoute) {
  const aSegments = a.pathname.split('/');
  const bSegments = b.pathname.split('/');

  const aSegmentsLen = aSegments.length;
  const bSegmentsLen = bSegments.length;

  if (aSegmentsLen > bSegmentsLen) return -1;
  if (aSegmentsLen < bSegmentsLen) return 1;

  if (aSegmentsLen === bSegmentsLen) {
    let aCatchalls = 0;
    let bCatchalls = 0;
    let aParams = 0;
    let bParams = 0;
    for (let i = 1; i < aSegmentsLen; i++) {
      const aSegment = aSegments[i];
      const bSegment = bSegments[i];

      const aHasCatchall = aSegment.includes('[...');
      const bHasCatchall = bSegment.includes('[...');
      if (!aHasCatchall && bHasCatchall) {
        return -1;
      }
      if (aHasCatchall && !bHasCatchall) {
        return 1;
      }

      const aHasParam = aSegment.includes('[');
      const bHasParam = bSegment.includes('[');
      if (!aHasParam && bHasParam) {
        return -1;
      }
      if (aHasParam && !bHasParam) {
        return 1;
      }

      if (aHasCatchall) {
        aCatchalls++;
      }
      if (bHasCatchall) {
        bCatchalls++;
      }
      if (aHasParam) {
        aParams++;
      }
      if (bHasParam) {
        bParams++;
      }
    }
    if (aCatchalls < bCatchalls) {
      return -1;
    }
    if (aCatchalls > bCatchalls) {
      return 1;
    }
    if (aParams < bParams) {
      return -1;
    }
    if (aParams > bParams) {
      return 1;
    }
  }

  if (a.type === 'endpoint' && b.type === 'page') return -1;
  if (a.type === 'page' && b.type === 'endpoint') return 1;

  if (a.pathname.toLowerCase() < b.pathname.toLowerCase()) return -1;
  if (a.pathname.toLowerCase() > b.pathname.toLowerCase()) return 1;

  return 0;
}
