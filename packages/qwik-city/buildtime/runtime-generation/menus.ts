import type { BuildContext } from '../types';
import { createFileId } from '../utils/fs';
import { getImportPath } from './utils';

export function createMenus(ctx: BuildContext, c: string[], esmImports: string[]) {
  if (ctx.menus.length > 0) {
    const dynamicImports = ctx.target === 'client';
    const routesDir = ctx.opts.routesDir;

    c.push(`\n/** Qwik City Menus (${ctx.menus.length}) */`);
    c.push(`const menus = [`);
    for (const m of ctx.menus) {
      const importPath = JSON.stringify(getImportPath(m.filePath));
      if (dynamicImports) {
        c.push(`  [${JSON.stringify(m.pathname)}, ()=>import(${importPath})],`);
      } else {
        const id = createFileId(routesDir, m.filePath);
        esmImports.push(`import * as ${id} from ${importPath};`);
        c.push(`  [${JSON.stringify(m.pathname)}, ()=>${id}],`);
      }
    }
    c.push(`];`);
  }

  return ctx.menus.length;
}
