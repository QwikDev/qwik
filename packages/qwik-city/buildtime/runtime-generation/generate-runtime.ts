import type { BuildContext } from '../types';
import { createMenus } from './menus';
import { createInlinedImportRoutes } from './routes';

/**
 * Generates the Qwik City Plan runtime code
 * See: packages/qwik-city/src/runtime/qwik-city-plan.ts
 */
export function generateQwikCityPlan(ctx: BuildContext) {
  const esmImports: string[] = [];
  const c: string[] = [];

  createInlinedImportRoutes(ctx, c, esmImports);

  if (ctx.menus.length > 0) {
    createMenus(ctx, c);
  }

  c.push(`\n/** Qwik City Plan */`);
  c.push(`const qwikCityPlan = {`);
  c.push(`  routes,`);

  if (ctx.menus.length > 0) {
    c.push(`  menus,`);
  }

  if (ctx.opts.trailingSlash) {
    c.push(`  trailingSlash: true,`);
  }

  c.push(`};`);

  c.push(`export default qwikCityPlan;`);

  return esmImports.join('\n') + c.join('\n');
}
