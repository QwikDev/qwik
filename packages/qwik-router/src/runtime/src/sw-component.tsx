import swRegister from '@qwik-router-sw-register';
/**
 * Loads the service workers that are defined in the routes. Any file named `service-worker.*` (all
 * JS extensions are allowed) will be picked up, bundled into a separate file, and registered as a
 * service worker.
 *
 * @public
 */
export const ServiceWorkerRegister = (props: { nonce?: string }) => (
  <script type="module" dangerouslySetInnerHTML={swRegister} nonce={props.nonce} />
);
