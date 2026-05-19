/**
 * @deprecated This is no longer needed, Qwik now automatically embeds preloading logic into the
 *   application.
 *
 *   If your service-worker.ts file contains no custom code, you should deploy to production until
 *   you're sure that all users picked up the new version, then you can remove it and also remove
 *   the `<ServiceWorkerRegister />` component from your `Root.tsx`.
 *
 *   If you do have custom service worker logic, you should keep the `service-worker.ts` file and
 *   `<ServiceWorkerRegister />` component, but remove the `setupServiceWorker()` call.
 * @public
 */
export const setupServiceWorker = () => {};
