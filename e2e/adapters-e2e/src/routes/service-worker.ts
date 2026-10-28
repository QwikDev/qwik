import { greeting } from '~/greeting';

export declare const self: ServiceWorkerGlobalScope;

self.addEventListener('message', (event) => {
  event.ports[0].postMessage(greeting());
});
