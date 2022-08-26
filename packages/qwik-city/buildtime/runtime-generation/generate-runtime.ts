import type { BuildContext } from '../types';
import { createEntries } from './generate-entries';
import { createMenus } from './generate-menus';
import { createRoutes } from './generate-routes';

/**
 * Generates the Qwik City Plan runtime code
 */
export function generateQwikCityPlan(ctx: BuildContext) {
  const esmImports: string[] = [];
  const c: string[] = [];

  c.push(`\n/** Qwik City Plan */`);

  createRoutes(ctx, c, esmImports);

  createMenus(ctx, c, esmImports);

  createEntries(ctx, c);

  c.push(`export const cacheModules = ${JSON.stringify(!ctx.isDevServer)};`);

  return esmImports.join('\n') + c.join('\n');
}
