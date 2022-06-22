import { dirname } from 'path';
import type { BuildContext, BuildLayout, BuildRoute } from '../types';
import { createFileId, normalizePath } from '../utils/fs';

export function parseLayoutFile(ctx: BuildContext, routesDir: string, filePath: string) {
  const layoutDir = dirname(filePath);
  const layoutId = createFileId(ctx, routesDir, filePath, 'Layout');

  const layout: BuildLayout = {
    id: layoutId,
    filePath: normalizePath(filePath),
    dir: normalizePath(layoutDir),
  };

  return layout;
}

export function updatePageLayouts(routesDir: string, routes: BuildRoute[], layouts: BuildLayout[]) {
  for (const route of routes) {
    if (route.type === 'page') {
      let routeDir = normalizePath(dirname(route.filePath));

      for (let i = 0; i < 20; i++) {
        const layout = layouts.find((l) => l.dir === routeDir);
        if (layout) {
          route.layouts.push({ ...layout });
        }

        if (routeDir === routesDir) {
          break;
        }

        routeDir = normalizePath(dirname(routeDir));
      }

      route.layouts.reverse();
    }
  }
}
