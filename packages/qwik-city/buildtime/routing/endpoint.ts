import type { EndpointRoute, NormalizedPluginOptions, RouteSourceFile } from '../types';
import { createFileId } from '../utils/fs';
import { getPathnameFromFilePath } from '../utils/pathname';
import { parseRoutePathname } from './parse-pathname';

export function resolveEndpointRoute(
  opts: NormalizedPluginOptions,
  endpointSourceFile: RouteSourceFile
) {
  const filePath = endpointSourceFile.filePath;
  const { pathname } = getPathnameFromFilePath(opts, filePath);
  const route = parseRoutePathname(pathname);

  const endpointRoute: EndpointRoute = {
    type: 'endpoint',
    id: createFileId(opts.routesDir, filePath),
    filePath,
    pathname,
    pattern: route.pattern,
    paramNames: route.paramNames,
  };

  return endpointRoute;
}
