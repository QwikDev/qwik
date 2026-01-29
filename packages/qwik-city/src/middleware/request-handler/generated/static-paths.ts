/**
 * Generated function which returns whether a given request past is a static path.
 *
 * @param method
 * @param url
 * @returns
 */
export function isStaticPath(method: string, url: URL) {
  if (method !== 'GET') {
    return false;
  }
  if (url.search !== '') {
    return false;
  }

  /**
   * - Generated values in vite post build
   *
   * Const p = url.pathname;
   *
   * If (p.startsWith(baseBuildPath)) { return true; }
   *
   * If (p.startsWith(assetsPath)) { return true; }
   *
   * If (staticPaths.has(p)) { return true; }
   *
   * If (p.endsWith('/q-data.json')) { const pWithoutQdata = p.replace(//q-data.json$/, '');
   *
   * If (staticPaths.has(pWithoutQdata + '/')) { return true; }
   *
   * If (staticPaths.has(pWithoutQdata)) { return true; }
   */

  return /\.(jpg|jpeg|png|webp|avif|gif|svg|ico)$/.test(url.pathname);
}
