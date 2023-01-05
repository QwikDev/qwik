export function isStaticPath(method: string, url: URL) {
  if (method !== 'GET') {
    return false;
  }
  if (url.searchParams.get('qwikcity.static') === 'false') {
    return false;
  }
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url.pathname);
}
