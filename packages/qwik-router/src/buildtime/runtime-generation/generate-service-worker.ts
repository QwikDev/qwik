import type { RoutingContext } from '../types';

export function generateServiceWorkerRegister(ctx: RoutingContext, swRegister: string) {
  let swReg: string;
  let swUrl = '/service-worker.js';

  // Also unregister if the developer removed the service-worker.ts file since Qwik 1.14.0 and above now use modulepreload by default
  if (ctx.serviceWorkers.length === 0) {
    swReg = SW_UNREGISTER;
  } else {
    swReg = swRegister;

    const sw = ctx.serviceWorkers.sort((a, b) =>
      a.chunkFileName.length < b.chunkFileName.length ? -1 : 1
    )[0];
    swUrl = ctx.opts.basePathname + sw.chunkFileName;
  }
  swReg = swReg.replace('__url', swUrl);

  return `export default ${JSON.stringify(swReg)};`;
}

const SW_UNREGISTER = `
"serviceWorker"in navigator&&navigator.serviceWorker.getRegistrations().then(r=>{for(const e of r){const c='__url'.split("/").pop();e.active?.scriptURL.endsWith(c||"service-worker.js")&&e.unregister().catch(console.error)}}),"caches"in window&&caches.keys().then(r=>{const e=r.find(c=>c.startsWith("QwikBuild"));e&&caches.delete(e).catch(console.error)}).catch(console.error)
`;
// Code in SW_UNREGISTER unregisters the service worker and deletes the cache; it is the minified version of the following:
// (() => {
//   if ('serviceWorker' in navigator) {
//     navigator.serviceWorker.getRegistrations().then((regs) => {
//       for (const reg of regs) {
//         const url = '__url'.split('/').pop();
//         if (reg.active?.scriptURL.endsWith(url || 'service-worker.js')) {
//           reg.unregister().catch(console.error);
//         }
//       }
//     });
//   }
//   if ('caches' in window) {
//     caches
//       .keys()
//       .then((names) => {
//         const cacheName = names.find((name) => name.startsWith('QwikBuild'));
//         if (cacheName) {
//           caches.delete(cacheName).catch(console.error);
//         }
//       })
//       .catch(console.error);
//   }
// })();
