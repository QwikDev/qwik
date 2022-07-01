import { dirname } from 'path';
import type { BuildContext, BuildLayout, PageRoute } from '../types';
import { createFileId, normalizePath } from '../utils/fs';
import { getPathnameFromFilePath } from '../utils/pathname';
import { parsePathname } from './parse-route';

export function createPageRoute(
  ctx: BuildContext,
  routesDir: string,
  filePath: string,
  source: 'markdown' | 'module'
) {
  const pageRoute: PageRoute = {
    type: 'page',
    id: createFileId(ctx, routesDir, filePath),
    filePath,
    pathname: getPathnameFromFilePath(ctx.opts, filePath),
    pattern: undefined as any,
    paramNames: undefined as any,
    paramTypes: undefined as any,
    source,
    layouts: [],
  };
  return pageRoute;
}

export function updatePageRoute(routesDir: string, pageRoute: PageRoute, layouts: BuildLayout[]) {
  const segments = pageRoute.pathname.split('/');
  const fileName = segments[segments.length - 1];
  const pageLayouts: BuildLayout[] = [];

  let layoutName = '';

  const parts = fileName.split('@');
  if (parts.length > 1) {
    layoutName = parts.pop()!;
    segments[segments.length - 1] = parts.join('.');
    if (segments[segments.length - 1] === 'index') {
      segments.pop();
    }
    pageRoute.pathname = segments.join('/');
  }

  let routeDir = normalizePath(dirname(pageRoute.filePath));

  for (let i = 0; i < 20; i++) {
    const layout = layouts.find((l) => l.dir === routeDir && l.name === layoutName);
    if (layout) {
      pageLayouts.push(layout);
      if (layout.type === 'top') {
        break;
      }
    }

    if (routeDir === routesDir) {
      break;
    }

    routeDir = normalizePath(dirname(routeDir));
  }

  pageRoute.layouts = pageLayouts.reverse();

  const route = parsePathname(pageRoute.pathname);
  pageRoute.pattern = route.pattern;
  pageRoute.paramNames = route.paramNames;
  pageRoute.paramTypes = route.paramTypes;
}
