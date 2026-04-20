import { isServer } from '@qwik.dev/core/build';
import type { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestEventInternal } from './request-event-core';

/** @internal */
export let _asyncRequestStore: AsyncLocalStorage<RequestEventInternal> | undefined;

if (isServer) {
  // TODO when we drop cjs support, await this
  import('node:async_hooks')
    .then((module) => {
      if (module.AsyncLocalStorage) {
        _asyncRequestStore = new module.AsyncLocalStorage();
      }
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
