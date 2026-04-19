import { isServer } from '@qwik.dev/core/build';
import type { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestEventInternal } from './request-event-core';

// Use globals to work around duplicate bundling
const STORE_KEY = Symbol.for('@qwik.dev/router/_asyncRequestStore');
const INIT_KEY = Symbol.for('@qwik.dev/router/_asyncRequestStore.init');

type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: AsyncLocalStorage<RequestEventInternal>;
  [INIT_KEY]?: Promise<void>;
};

const globalWithStore = globalThis as GlobalWithStore;

if (isServer && !globalWithStore[INIT_KEY]) {
  // TODO when we drop cjs support, make this top-level await
  globalWithStore[INIT_KEY] = import('node:async_hooks')
    .then((module) => {
      // Another chunk may have raced us — keep the first one that won.
      globalWithStore[STORE_KEY] ||= new module.AsyncLocalStorage();
    })
    .catch((err) => {
      console.warn(
        '\n=====================\n' +
          '  Qwik Router Warning:\n' +
          '    AsyncLocalStorage is not available, continuing without it.\n' +
          '    This impacts concurrent async server calls, where they lose access to the ServerRequestEv object.\n' +
          '=====================\n\n',
        err
      );
    });
}

/**
 * Returns the process-wide `AsyncLocalStorage` used to thread the current `RequestEvent` through
 * async boundaries. `undefined` on non-Node platforms, or until the lazy `node:async_hooks` import
 * resolves.
 *
 * @internal
 */
export const _getAsyncRequestStore = (): AsyncLocalStorage<RequestEventInternal> | undefined => {
  return globalWithStore[STORE_KEY];
};
