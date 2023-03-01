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
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url.pathname);
}
