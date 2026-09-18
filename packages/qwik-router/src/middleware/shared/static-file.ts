import { ensureSlash } from '../../utils/pathname';

export function getStaticFilePath(pathname: string): string | undefined {
  const basePathname = globalThis.__QWIK_ROUTER_BASE_PATHNAME__ || '/';
  if (pathname === basePathname.slice(0, -1)) {
    return '/index.html';
  }
  if (!pathname.startsWith(basePathname)) {
    return undefined;
  }
  const relativePathname = pathname.slice(basePathname.length - 1);
  const lastSegment = relativePathname.slice(relativePathname.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) {
    return relativePathname;
  }
  return ensureSlash(relativePathname) + 'index.html';
}
