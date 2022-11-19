export function isStaticPath(pathname: string) {
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(pathname);
}
