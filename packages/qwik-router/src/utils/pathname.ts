import type { PathParams } from '../runtime/src';

export function normalizePathname(
  pathname: string | undefined | null,
  basePathname: string,
  trailingSlash: boolean
) {
  if (typeof pathname === 'string') {
    pathname = pathname.trim();

    if (pathname !== '') {
      try {
        // remove duplicate forward slashes
        pathname = pathname.replace(/\/+/g, '/');

        if (pathname.startsWith('/')) {
          pathname = pathname.slice(1);
        }

        // normalize the basePath and pathname together
        // origin doesn't matter here
        pathname = new URL(basePathname + pathname, `https://qwik.dev`).pathname;

        if (pathname !== basePathname) {
          if (trailingSlash) {
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
  params: PathParams | undefined
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

export function isSameOriginUrl(url: string) {
  if (typeof url === 'string') {
    url = url.trim();
    if (url !== '') {
      const firstChar = url.charAt(0);
      if (firstChar !== '/' && firstChar !== '.') {
        if (firstChar === '#') {
          return false;
        }
        const i = url.indexOf(':');
        if (i > -1) {
          const protocol = url.slice(0, i).toLowerCase();
          return !PROTOCOLS[protocol];
        }
      }
      return true;
    }
  }
  return false;
}

const PROTOCOLS: { [protocol: string]: boolean } = {
  https: true,
  http: true,
  about: true,
  javascript: true,
  file: true,
};
