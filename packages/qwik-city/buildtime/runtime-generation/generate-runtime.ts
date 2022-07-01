import type { BuildContext } from '../types';
import { createMenus } from './menus';
import { createRoutes } from './routes';

/**
 * Generates the Qwik City Plan runtime code
 */
export function generateQwikCityPlan(ctx: BuildContext) {
  const esmImports: string[] = [];
  const c: string[] = [];

  createRoutes(ctx, c, esmImports);

  const totalMenus = createMenus(ctx, c);

  c.push(`\n/** Qwik City Plan */`);
  c.push(`const qwikCityPlan = {`);

  c.push(`  routes,`);

  if (totalMenus > 0) {
    c.push(`  menus,`);
  }

  if (ctx.opts.trailingSlash) {
    c.push(`  trailingSlash: true,`);
  }

  c.push(`};`);

  c.push(`export default qwikCityPlan;\n`);

  return esmImports.join('\n') + c.join('\n');
}
