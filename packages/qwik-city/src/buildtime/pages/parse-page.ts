import type { BuildContext, PageRoute } from '../types';
import { createFileId } from '../utils/fs';
import { getPagePathname } from '../utils/pathname';
import { parseRouteId } from '../routing/parse-route';

export function parsePageFile(ctx: BuildContext, routesDir: string, filePath: string) {
  const id = createFileId(ctx, routesDir, filePath);
  const pathname = getPagePathname(ctx.opts, filePath);
  const route = parseRouteId(pathname);

  const pageRoute: PageRoute = {
    type: 'page',
    id,
    pathname,
    filePath,
    layouts: [],
    default: undefined,
    attributes: undefined,
    head: undefined,
    ...route,
  };

  return pageRoute;
}
