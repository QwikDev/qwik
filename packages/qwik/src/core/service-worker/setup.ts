import { directFetch } from './direct-fetch';
import { processMessage } from './process-message';
import { createState, type SWState } from './state';

export const setupServiceWorker = (swScope: ServiceWorkerGlobalScope) => {
  const swState: SWState = createState(swScope.fetch.bind(swScope), new URL(swScope.location.href));
  swScope.addEventListener('fetch', async (ev) => {
    const request = ev.request;
    if (request.method === 'GET') {
      const response = await directFetch(swState, new URL(request.url));
      if (response) {
        ev.respondWith(response);
      }
    }
  });
  swScope.addEventListener('message', (ev) => processMessage(swState, ev.data));
  swScope.addEventListener('install', () => swScope.skipWaiting());
  swScope.addEventListener('activate', async () => {
    swScope.clients.claim();
    swState.$cache$ = await swScope.caches.open('QwikBundles');
  });
};
