import { ROUTE_TYPE_ENDPOINT } from '../../runtime/constants';
import type { BuildContext, BuildRoute } from '../types';
import { getImportPath } from './utils';

export function createInlinedImportRoutes(ctx: BuildContext, c: string[], esmImports: string[]) {
  c.push(`\n/** Qwik City Layouts (${ctx.layouts.length}) */`);
  for (const layout of ctx.layouts) {
    const importPath = getImportPath(layout.filePath);
    esmImports.push(`import * as ${layout.id}_ from ${JSON.stringify(importPath)};`);

    c.push(`const ${layout.id} = () => ${layout.id}_;`);
  }

  if (ctx.target === 'ssr') {
    // SSR build gets all routes, including endpoints
    const endpointRoutes = ctx.routes.filter((r) => r.type === 'endpoint');
    c.push(`\n/** Qwik City Endpoints (${endpointRoutes.length}) */`);

    for (const route of endpointRoutes) {
      const importPath = getImportPath(route.filePath);
      esmImports.push(`import * as ${route.id}_ from ${JSON.stringify(importPath)};`);

      c.push(`const ${route.id} = () => ${route.id}_;`);
    }
  }

  const pageRoutes = ctx.routes.filter((r) => r.type === 'page');
  c.push(`\n/** Qwik City Pages (${pageRoutes.length}) */`);

  for (const route of pageRoutes) {
    const importPath = getImportPath(route.filePath);
    esmImports.push(`import * as ${route.id}_ from ${JSON.stringify(importPath)};`);

    c.push(`const ${route.id} = () => ${route.id}_;`);
  }

  const routes = ctx.routes.filter((r) => ctx.target === 'ssr' || r.type === 'page');
  c.push(`\n/** Qwik City Routes (${routes.length}) */`);
  c.push(`const routes = [`);

  for (const route of routes) {
    const loaders = [];
    if (route.type === 'page') {
      for (const layout of route.layouts) {
        loaders.push(layout.id);
      }
    }
    loaders.push(route.id);
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
