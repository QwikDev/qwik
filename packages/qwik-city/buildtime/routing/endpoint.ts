import type { BuildContext, EndpointRoute } from '../types';
import { createFileId } from '../utils/fs';
import { getPathnameFromFilePath } from '../utils/pathname';
import { parsePathname } from './parse-route';

export function createEndpointRoute(ctx: BuildContext, routesDir: string, filePath: string) {
  const pathname = getPathnameFromFilePath(ctx.opts, filePath);
  const route = parsePathname(pathname);

  const endpointRoute: EndpointRoute = {
    type: 'endpoint',
    id: createFileId(ctx, routesDir, filePath),
    filePath,
    pathname,
    ...route,
  };

  return endpointRoute;
}
