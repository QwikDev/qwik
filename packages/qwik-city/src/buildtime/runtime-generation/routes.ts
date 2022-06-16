import { ROUTE_TYPE_ENDPOINT } from '../../runtime/constants';
import type { BuildContext, BuildRoute } from '../types';
import { getImportPath } from './utils';

export function createInlinedImportRoutes(ctx: BuildContext, c: string[], esmImports: string[]) {
  for (const layout of ctx.layouts) {
    const importPath = getImportPath(layout.filePath);
    esmImports.push(`import * as ${layout.id}_ from ${JSON.stringify(importPath)};`);

    c.push(`const App${layout.id} = () => ${layout.id}_;`);
  }

  for (const route of ctx.routes) {
    const importPath = getImportPath(route.filePath);
    esmImports.push(`import * as ${route.id}_ from ${JSON.stringify(importPath)};`);

    c.push(`const App${route.id} = () => ${route.id}_;`);
  }

  c.push(`export const routes = [`);

  for (const route of ctx.routes) {
    const loaders = [];
    if (route.type === 'page') {
      for (const layout of route.layouts) {
        loaders.push(`App${layout.id}`);
      }
    }
    loaders.push(`App${route.id}`);
    const moduleLoaders = `[ ${loaders.join(', ')} ]`;

    c.push(`  ${createRoute(route, moduleLoaders)},`);
  }

  c.push(`];`);
}

function createRoute(r: BuildRoute, moduleLoaders: string) {
  const pattern = r.pattern.toString();

  if (r.type === 'endpoint') {
    const paramNames = JSON.stringify(r.paramNames);
    return `[ ${pattern}, ${moduleLoaders}, ${paramNames}, ${ROUTE_TYPE_ENDPOINT} ]`;
  }

  if (r.paramNames.length > 0) {
    const paramNames = JSON.stringify(r.paramNames);
    return `[ ${pattern}, ${moduleLoaders}, ${paramNames} ]`;
  }

  return `[ ${pattern}, ${moduleLoaders} ]`;
}
