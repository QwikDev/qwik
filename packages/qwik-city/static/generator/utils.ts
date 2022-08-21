import type { RouteParams } from '../../runtime/src';
import type { StaticGeneratorOptions } from './types';

export function normalizePathname(
  opts: StaticGeneratorOptions,
  pathname: string | undefined | null
) {
  if (typeof pathname === 'string') {
    pathname = pathname.trim();

    if (pathname !== '') {
      try {
        if (pathname.startsWith('/')) {
          pathname = pathname.slice(1);
        }

        pathname = new URL(pathname, opts.baseUrl).pathname;

        if (pathname !== '/') {
          if (opts.trailingSlash) {
            if (!pathname.endsWith('/')) {
              const segments = pathname.split('/');
              const lastSegment = segments[segments.length - 1];

              if (!lastSegment.includes('.')) {
                pathname += '/';
              }
            }
          } else {
            if (pathname.endsWith('/')) {
              pathname = pathname.slice(0, pathname.length - 1);
            }
          }
        }

        return pathname;
      } catch (e) {
        console.error(e);
      }
    }
  }
  return null;
}

export function getPathnameForDynamicRoute(
  originalPathname: string,
  paramNames: string[] | undefined,
  params: RouteParams | undefined
) {
  let pathname = originalPathname;

  if (paramNames && params) {
    for (const paramName of paramNames) {
      const paramKey = `[${paramName}]`;
      const restParamKey = `[...${paramName}]`;
      const paramValue = params[paramName];
      pathname = pathname.replace(restParamKey, paramValue);
      pathname = pathname.replace(paramKey, paramValue);
    }
  }

  return pathname;
}

export function msToString(ms: number) {
  if (ms < 1) {
    return ms.toFixed(2) + ' ms';
  }
  if (ms < 1000) {
    return ms.toFixed(1) + ' ms';
  }
  if (ms < 60000) {
    return (ms / 1000).toFixed(1) + ' s';
  }
  return (ms / 60000).toFixed(1) + ' m';
}
