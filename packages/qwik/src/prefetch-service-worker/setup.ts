import { directFetch } from './direct-fetch';
import { drainMsgQueue } from './process-message';
import { createState, type SWState } from './state';

export const setupServiceWorker = (swScope: ServiceWorkerGlobalScope) => {
  const swState: SWState = createState(swScope.fetch.bind(swScope), new URL(swScope.location.href));
  swScope.addEventListener('fetch', async (ev) => {
    const request = ev.request;
    if (request.method === 'GET') {
      const previousCache = swState.$cache$;
      try {
        !previousCache && (await swState.$openCache$());
        const response = directFetch(swState, new URL(request.url));
        if (response) {
          ev.respondWith(response);
        }
      } finally {
        swState.$cache$ = previousCache;
      }
    }
  });
  swScope.addEventListener('message', (ev) => {
    swState.$msgQueue$.push(ev.data);
    drainMsgQueue(swState);
  });
  swScope.addEventListener('install', () => swScope.skipWaiting());
  swScope.addEventListener('activate', async (event) => {
    event.waitUntil(swScope.clients.claim());
    swState.$openCache$ = async () => {
      return (swState.$cache$ = await swScope.caches.open('QwikBundles'));
    };
  });
};
