import type { BuildContext } from '../types';

export function generateServiceWorkerRegister(
  ctx: BuildContext,
  swRegister: string,
  didNotAddCustomCode: boolean
) {
  let swReg: string;
  let swUrl = '/service-worker.js';

  // Also unregister if the developer did not add custom code to the service worker since Qwik 1.14.0 and above now use modulepreload by default
  if (ctx.isDevServer || didNotAddCustomCode) {
    swReg = SW_UNREGISTER;
  } else {
    swReg = swRegister;

    if (ctx.serviceWorkers.length > 0) {
      const sw = ctx.serviceWorkers.sort((a, b) =>
        a.chunkFileName.length < b.chunkFileName.length ? -1 : 1
      )[0];
      swUrl = ctx.opts.basePathname + sw.chunkFileName;
    }
  }
  swReg = swReg.replace('__url', swUrl);

  return `export default ${JSON.stringify(swReg)};`;
}

const SW_UNREGISTER = `
(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        const url = '__url'.split('/').pop();
        if (reg.active?.scriptURL.endsWith(url || 'service-worker.js')) {
          reg.unregister().catch(console.error);
        }
      }
    });
  }
  if ('caches' in window) {
    caches
      .keys()
      .then((names) => {
        const cacheName = names.find((name) => name.startsWith('QwikBuild'));
        if (cacheName) {
          caches.delete(cacheName).catch(console.error);
        }
      })
      .catch(console.error);
  }
})();
`;
