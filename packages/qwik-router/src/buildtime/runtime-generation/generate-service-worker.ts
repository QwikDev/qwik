import type { RoutingContext } from '../types';

/** The URL of the app's service worker entry, when the routes define one. */
export function resolveServiceWorkerUrl(ctx: RoutingContext): string | undefined {
  if (ctx.serviceWorkers.length === 0) {
    return undefined;
  }
  const sw = ctx.serviceWorkers.sort((a, b) =>
    a.chunkFileName.length < b.chunkFileName.length ? -1 : 1
  )[0];
  return ctx.opts.basePathname + sw.chunkFileName;
}

/** The `@qwik-router-sw-register` module, kept for apps that import it themselves. */
export function generateServiceWorkerRegister(ctx: RoutingContext) {
  return (
    `import { _getServiceWorkerScript } from '@qwik.dev/router';\n` +
    `export default _getServiceWorkerScript(${JSON.stringify(resolveServiceWorkerUrl(ctx))});\n`
  );
}
