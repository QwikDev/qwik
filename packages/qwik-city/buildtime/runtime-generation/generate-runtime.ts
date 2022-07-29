import type { BuildContext } from '../types';
import { createEntries } from './entries';
import { createMenus } from './menus';
import { createRoutes } from './routes';

/**
 * Generates the Qwik City Plan runtime code
 */
export function generateQwikCityPlan(ctx: BuildContext) {
  const esmImports: string[] = [];
  const c: string[] = [];

  createRoutes(ctx, c, esmImports);

  const totalMenus = createMenus(ctx, c, esmImports);

  c.push(`\n/** Qwik City Plan */`);
  c.push(`const qwikCityPlan = {`);

  c.push(`  routes,`);

  if (totalMenus > 0) {
    c.push(`  menus,`);
  }

  if (ctx.opts.trailingSlash) {
    c.push(`  trailingSlash: true,`);
  }

  if (ctx.isDevServerBuild) {
    c.push(`  cacheModules: false,`);
  }

  c.push(`};`);

  createEntries(ctx, c, esmImports);

  c.push(`export default qwikCityPlan;\n`);

  return esmImports.join('\n') + c.join('\n');
}
