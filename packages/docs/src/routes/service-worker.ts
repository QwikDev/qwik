/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { setupServiceWorker } from '@qwikdev/city/service-worker';

setupServiceWorker();

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));
