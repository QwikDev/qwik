export const IsQData = '@isQData';
export const QDATA_JSON = '/q-data.json';

/**
 * The pathname used to match in the route regex array. A pathname ending with /q-data.json should
 * be treated as a pathname without it.
 */
export function getRouteMatchPathname(pathname: string) {
  const isInternal = pathname.endsWith(QDATA_JSON);
  if (isInternal) {
    const trimEnd =
      pathname.length - QDATA_JSON.length + (globalThis.__NO_TRAILING_SLASH__ ? 0 : 1);
    pathname = pathname.slice(0, trimEnd);
    if (pathname === '') {
      pathname = '/';
    }
  }
  return { pathname, isInternal };
}
