import { ROUTE_TYPE_ENDPOINT } from '../../runtime/src/library//constants';
import type { BuildContext, BuildRoute } from '../types';
import { getImportPath } from './utils';

export function createRoutes(ctx: BuildContext, c: string[], esmImports: string[]) {
  const includeEndpoints = ctx.target === 'ssr';
  const dynamicImports = ctx.target === 'client';

  if (ctx.layouts.length > 0) {
    c.push(`\n/** Qwik City Layouts (${ctx.layouts.length}) */`);
    for (const layout of ctx.layouts) {
      const importPath = getImportPath(layout.filePath);
      if (dynamicImports) {
        c.push(`const ${layout.id} = ()=>import(${JSON.stringify(importPath)});`);
      } else {
        esmImports.push(`import * as ${layout.id}_ from ${JSON.stringify(importPath)};`);
        c.push(`const ${layout.id} = ()=>${layout.id}_;`);
      }
    }
  }

  const routes = ctx.routes.filter(
    (r) => r.type === 'page' || (includeEndpoints && r.type === 'endpoint')
  );

  c.push(`\n/** Qwik City Routes (${routes.length}) */`);
  c.push(`const routes = [`);

  for (const route of routes) {
    const loaders = [];

    if (route.type === 'page') {
      for (const layout of route.layouts) {
        loaders.push(layout.id);
      }

      const importPath = getImportPath(route.filePath);
      if (dynamicImports) {
        loaders.push(`()=>import(${JSON.stringify(importPath)})`);
      } else {
        esmImports.push(`import * as ${route.id} from ${JSON.stringify(importPath)};`);
        loaders.push(`()=>${route.id}`);
      }
    } else if (route.type === 'endpoint' && includeEndpoints) {
      const importPath = getImportPath(route.filePath);
      esmImports.push(`import * as ${route.id} from ${JSON.stringify(importPath)};`);
      loaders.push(`()=>${route.id}`);
    }

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
