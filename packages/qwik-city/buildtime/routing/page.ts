import { dirname } from 'path';
import type { BuildLayout, NormalizedPluginOptions, PageRoute, RouteSourceFile } from '../types';
import { createFileId, normalizePath } from '../utils/fs';
import { getPathnameFromFilePath } from '../utils/pathname';
import { parseRoutePathname } from './parse-pathname';

export function resolvePageModuleRoute(
  opts: NormalizedPluginOptions,
  pageSourceFile: RouteSourceFile,
  layouts: BuildLayout[]
) {
  const filePath = pageSourceFile.filePath;
  const { pathname, layoutName } = getPathnameFromFilePath(opts, filePath);

  const pageLayouts: BuildLayout[] = [];

  let currentDir = normalizePath(dirname(filePath));

  for (let i = 0; i < 20; i++) {
    const layout = layouts.find((l) => l.dirPath === currentDir && l.layoutName === layoutName);
    if (layout) {
      pageLayouts.push(layout);
      if (layout.type === 'top') {
        break;
      }
    }

    if (currentDir === opts.routesDir) {
      break;
    }

    currentDir = normalizePath(dirname(currentDir));
  }

  const route = parseRoutePathname(pathname);

  const pageRoute: PageRoute = {
    type: 'page',
    id: createFileId(opts.routesDir, filePath),
    filePath,
    pathname,
    pattern: route.pattern,
    paramNames: route.paramNames,
    layouts: pageLayouts.reverse(),
  };

  return pageRoute;
}
