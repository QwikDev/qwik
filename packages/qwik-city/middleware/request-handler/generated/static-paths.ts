export function isStaticPath(url: URL) {
  if (url.searchParams.get('qwikcity.static') === 'false') {
    return false;
  }
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url.pathname);
}
