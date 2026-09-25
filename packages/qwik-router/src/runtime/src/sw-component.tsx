// Make the api documenter output clean
import type { JSXOutput } from '@qwik.dev/core';
import { _getServiceWorkerUrl } from './router-config';

// Minified inline scripts; `__url` is replaced with the service worker URL. Both delete the
// `QwikBuild` cache of the pre-1.14 service worker; the second also unregisters a worker the app
// no longer defines.
const SW_REGISTER = `(()=>{if("serviceWorker"in navigator){navigator.serviceWorker.register("__url").catch(e=>console.error(e));"caches"in window&&caches.keys().then(r=>{const e=r.find(c=>c.startsWith("QwikBuild"));e&&caches.delete(e).catch(console.error)}).catch(console.error)}else console.log("Service worker not supported in this browser.")})()`;
const SW_UNREGISTER = `"serviceWorker"in navigator&&navigator.serviceWorker.getRegistrations().then(r=>{for(const e of r){const c="__url".split("/").pop();e.active?.scriptURL.endsWith(c||"service-worker.js")&&e.unregister().catch(console.error)}}),"caches"in window&&caches.keys().then(r=>{const e=r.find(c=>c.startsWith("QwikBuild"));e&&caches.delete(e).catch(console.error)}).catch(console.error)`;

/** @internal */
export const _getServiceWorkerScript = (serviceWorkerUrl: string | undefined): string =>
  (serviceWorkerUrl ? SW_REGISTER : SW_UNREGISTER).replace(
    '__url',
    serviceWorkerUrl ?? '/service-worker.js'
  );

/**
 * Loads the service workers that are defined in the routes. Any file named `service-worker.*` (all
 * JS extensions are allowed) will be picked up, bundled into a separate file, and registered as a
 * service worker.
 *
 * Qwik 1.14.0 and above now use `<link rel="modulepreload">` by default. If you didn't add custom
 * service-worker logic, you should remove your service-worker.ts file(s) for the
 * `ServiceWorkerRegister` Component to actually unregister the service-worker.js and delete its
 * related cache. Make sure to keep the `ServiceWorkerRegister` Component in your app (without any
 * service-worker.ts file) as long as you want to unregister the service-worker.js for your users.
 *
 * @public
 */
export const ServiceWorkerRegister = (props: { nonce?: string }): JSXOutput => (
  // The server renders it after the request handler loaded the config.
  <script
    type="module"
    dangerouslySetInnerHTML={_getServiceWorkerScript(_getServiceWorkerUrl())}
    nonce={props.nonce}
  />
);
