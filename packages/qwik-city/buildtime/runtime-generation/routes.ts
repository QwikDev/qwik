import type { BuildContext, BuildRoute } from '../types';
import { addError } from '../utils/format';
import { isModuleExt, isPageExt } from '../utils/fs';
import { getImportPath } from './utils';

export function createRoutes(ctx: BuildContext, c: string[], esmImports: string[]) {
  const isSsr = ctx.target === 'ssr';
  const includeEndpoints = isSsr;
  const dynamicImports = ctx.target === 'client';

  if (ctx.layouts.length > 0) {
    c.push(`\n/** Qwik City Layouts (${ctx.layouts.length}) */`);
    for (const layout of ctx.layouts) {
      const importPath = JSON.stringify(getImportPath(layout.filePath));
      if (dynamicImports) {
        c.push(`const ${layout.id} = ()=>import(${importPath});`);
      } else {
        esmImports.push(`import * as ${layout.id}_ from ${importPath};`);
        c.push(`const ${layout.id} = ()=>${layout.id}_;`);
      }
    }
  }

  c.push(`\n/** Qwik City Routes (${ctx.routes.length}) */`);
  c.push(`const routes = [`);

  for (const route of ctx.routes) {
    const loaders = [];

    if (isPageExt(route.ext)) {
      // page module or markdown
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
    } else if (includeEndpoints && isModuleExt(route.ext)) {
      // include endpoints, and this is a module
      const importPath = getImportPath(route.filePath);
      esmImports.push(`import * as ${route.id} from ${JSON.stringify(importPath)};`);
      loaders.push(`()=>${route.id}`);
    }

    if (loaders.length > 0) {
      c.push(`  ${createRoute(route, loaders)},`);
    } else {
      addError(ctx, `Route "${route.pathname}" does not have any modules.`);
    }
  }

  c.push(`];`);
}

function createRoute(r: BuildRoute, loaders: string[]) {
  const pattern = r.pattern.toString();
  const moduleLoaders = `[ ${loaders.join(', ')} ]`;

  if (r.paramNames.length > 0) {
    const paramNames = JSON.stringify(r.paramNames);
    return `[ ${pattern}, ${moduleLoaders}, ${paramNames} ]`;
  }

  return `[ ${pattern}, ${moduleLoaders} ]`;
}
