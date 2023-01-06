/**
 * Generated function which returns whether a given request past is a static path.
 *
 * @param method - HTTP method
 * @param url - HTTP request URL
 * @returns
 */
export function isStaticPath(method: string, url: URL) {
  if (method !== 'GET') {
    return false;
  }
  if (url.searchParams.get('qwikcity.static') === 'false') {
    return false;
  }
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url.pathname);
}
