import type { BuildRoute } from '../types';

export function sortRoutes(a: BuildRoute, b: BuildRoute) {
  const aNames = a.paramNames.length;
  const bNames = b.paramNames.length;

  if (aNames === 0 && bNames > 0) return -1;
  if (aNames > 0 && bNames === 0) return 1;
  if (aNames > bNames) return -1;
  if (aNames < bNames) return 1;

  const aSegments = a.pathname.split('/').length;
  const bSegments = b.pathname.split('/').length;

  if (aSegments > bSegments) return -1;
  if (aSegments < bSegments) return 1;

  if (a.type === 'endpoint' && b.type === 'page') return -1;
  if (a.type === 'page' && b.type === 'endpoint') return 1;

  if (a.pathname.toLowerCase() < b.pathname.toLowerCase()) return -1;
  if (a.pathname.toLowerCase() > b.pathname.toLowerCase()) return 1;

  return 0;
}
