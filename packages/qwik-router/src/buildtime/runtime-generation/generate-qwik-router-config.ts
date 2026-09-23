import type { QwikVitePlugin } from '@qwik.dev/core/optimizer';
import type { RoutingContext } from '../types';
import { createEntries } from './generate-entries';
import { createRoutes, type RouteLoaderSourceFiles } from './generate-routes';
import { createServerPlugins } from './generate-server-plugins';

/** Generates the Qwik Router Config runtime code */
export function generateQwikRouterConfig(
  ctx: RoutingContext,
  qwikPlugin: QwikVitePlugin,
  isSSR: boolean,
  loadersByFile?: Map<string, string[]>,
  serverExcludePaths?: ReadonlySet<string>,
  routeLoaderSourceFiles?: RouteLoaderSourceFiles
) {
  const esmImports: string[] = [];
  const c: string[] = [];

  c.push(`\n/** Qwik Router Config */`);
  c.push(`\nimport { isDev } from '@qwik.dev/core/build';`);

  if (isSSR) {
    // The request handler awaits this before serving so the `server$` modules'
    // _regSymbol side effects run ahead of any RPC request — async on purpose,
    // so the config module evaluates without importing the runtime eagerly.
    esmImports.push(
      `import { importEagerModules } from 'virtual:qwik-router-server-fns';`,
      `export { importEagerModules } from 'virtual:qwik-router-server-fns';`
    );
  }

  createServerPlugins(ctx, qwikPlugin, c, esmImports, isSSR);

  createRoutes(
    ctx,
    qwikPlugin,
    c,
    esmImports,
    isSSR,
    loadersByFile,
    serverExcludePaths,
    routeLoaderSourceFiles
  );

  createEntries(ctx, c);

  c.push(`export const trailingSlash = ${JSON.stringify(!globalThis.__NO_TRAILING_SLASH__)};`);

  c.push(`export const basePathname = ${JSON.stringify(ctx.opts.basePathname)};`);

  c.push(`export const cacheModules = !isDev;`);

  if (isSSR) {
    c.push(
      `export default { routes, serverPlugins, trailingSlash, basePathname, cacheModules, importEagerModules };`
    );
  } else {
    c.push(`export default { routes, serverPlugins, trailingSlash, basePathname, cacheModules };`);
  }
  return esmImports.join('\n') + c.join('\n');
}
