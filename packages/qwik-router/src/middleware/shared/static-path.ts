export function getStaticFilePathname(pathname: string): string | undefined {
  const basePathname = globalThis.__QWIK_ROUTER_BASE_PATHNAME__ || '/';
  if (pathname === basePathname.slice(0, -1)) {
    return '/';
  }
  if (!pathname.startsWith(basePathname)) {
    return undefined;
  }
  return pathname.slice(basePathname.length - 1);
}
