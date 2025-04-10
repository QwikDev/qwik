import type { QwikVitePlugin } from '@qwik.dev/core/optimizer';
import type { BuildContext } from '../types';
import { createEntries } from './generate-entries';
import { createMenus } from './generate-menus';
import { createRoutes } from './generate-routes';
import { createServerPlugins } from './generate-server-plugins';

/** Generates the Qwik Router Config runtime code */
export function generateQwikRouterConfig(
  ctx: BuildContext,
  qwikPlugin: QwikVitePlugin,
  isSSR: boolean
) {
  const esmImports: string[] = [];
  const c: string[] = [];

  console.log('generateQwikRouterConfig');

  c.push(`\n/** Qwik Router Config */`);

  createServerPlugins(ctx, qwikPlugin, c, esmImports, isSSR);

  createRoutes(ctx, qwikPlugin, c, esmImports, isSSR);

  createMenus(ctx, c, esmImports, isSSR);

  createEntries(ctx, c);

  c.push(`export const trailingSlash = ${JSON.stringify(!!ctx.opts.trailingSlash)};`);

  c.push(`export const basePathname = ${JSON.stringify(ctx.opts.basePathname)};`);

  c.push(`export const cacheModules = ${JSON.stringify(!ctx.isDevServer)};`);

  c.push(
    `export default { routes, serverPlugins, menus, trailingSlash, basePathname, cacheModules };`
  );

  return esmImports.join('\n') + c.join('\n');
}
