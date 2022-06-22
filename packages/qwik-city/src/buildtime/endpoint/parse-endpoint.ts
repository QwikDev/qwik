import type { BuildContext, EndpointRoute } from '../types';
import { createFileId } from '../utils/fs';
import { getPagePathname } from '../utils/pathname';
import { parseRouteId } from '../routing/parse-route';

export function parseEndpointFile(ctx: BuildContext, routesDir: string, filePath: string) {
  const id = createFileId(ctx, routesDir, filePath, 'Endpoint');
  const pathname = getPagePathname(ctx.opts, filePath);
  const route = parseRouteId(pathname);

  const pageRoute: EndpointRoute = {
    type: 'endpoint',
    id,
    pathname,
    filePath,
    ...route,
  };

  return pageRoute;
}
