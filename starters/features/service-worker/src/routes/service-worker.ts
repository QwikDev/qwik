/*
 * WHAT IS THIS FILE?
 *
 * Any file called "service-worker" is automatically bundled and registered with Qwik Router, as long as you add `<RegisterServiceWorker />` in your `root.tsx`.
 *
 * Here you register the events that your service worker will handle.
 *
 * MDN has documentation at https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
 */
export declare const self: ServiceWorkerGlobalScope;

addEventListener("install", () => self.skipWaiting());

addEventListener("activate", () => self.clients.claim());
