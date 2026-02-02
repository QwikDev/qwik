import swRegister from '@qwik-router-sw-register';
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
export const ServiceWorkerRegister = (props: { nonce?: string }) => (
  <script type="module" dangerouslySetInnerHTML={swRegister} nonce={props.nonce} />
);
