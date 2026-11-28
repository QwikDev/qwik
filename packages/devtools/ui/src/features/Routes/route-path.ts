export function getAppRoutePath(pathname: string, base: string): string {
  if (base === '/') {
    return pathname;
  }
  if (pathname === base.slice(0, -1)) {
    return '/';
  }
  return pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : pathname;
}
