/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { setupServiceWorker } from '~qwik-city-runtime';

setupServiceWorker();

addEventListener('install', () => self.skipWaiting());

addEventListener('activate', () => self.clients.claim());
