import type { BuildContext, EndpointRoute } from '../types';
import { createFileId } from '../utils/fs';
import { getPathnameFromFilePath } from '../utils/pathname';
import { parsePathname } from './parse-pathname';

export function createEndpointRoute(ctx: BuildContext, filePath: string) {
  const pathname = getPathnameFromFilePath(ctx.opts, filePath);
  const route = parsePathname(pathname);

  const endpointRoute: EndpointRoute = {
    type: 'endpoint',
    id: createFileId(ctx, filePath),
    filePath,
    pathname,
    ...route,
  };

  return endpointRoute;
}
