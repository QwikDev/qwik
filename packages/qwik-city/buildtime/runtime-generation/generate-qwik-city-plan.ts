import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import type { BuildContext } from '../types';
import { createEntries } from './generate-entries';
import { createMenus } from './generate-menus';
import { createRoutes } from './generate-routes';
import { createServerPlugins } from './generate-server-plugins';

/**
 * Generates the Qwik City Plan runtime code
 */
export function generateQwikCityPlan(ctx: BuildContext, qwikPlugin: QwikVitePlugin) {
  const esmImports: string[] = [];
  const c: string[] = [];

  c.push(`\n/** Qwik City Plan */`);

  createServerPlugins(ctx, qwikPlugin, c, esmImports);

  createRoutes(ctx, qwikPlugin, c, esmImports);

  createMenus(ctx, c, esmImports);

  createEntries(ctx, c);

  c.push(`export const trailingSlash = ${JSON.stringify(!!ctx.opts.trailingSlash)};`);

  c.push(`export const basePathname = ${JSON.stringify(ctx.opts.basePathname)};`);

  c.push(`export const cacheModules = ${JSON.stringify(!ctx.isDevServer)};`);

  c.push(
    `export default { routes, serverPlugins, menus, trailingSlash, basePathname, cacheModules };`
  );

  return esmImports.join('\n') + c.join('\n');
}
