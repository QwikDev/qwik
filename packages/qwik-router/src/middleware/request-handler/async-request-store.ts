import { isServer } from '@qwik.dev/core/build';
import { _getAsyncLocalStorage } from '@qwik.dev/core/internal';
import type { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestEventInternal } from './request-event-core';

/** @internal */
export let _asyncRequestStore: AsyncLocalStorage<RequestEventInternal> | undefined;

if (isServer) {
  const AsyncLocalStorage = _getAsyncLocalStorage();
  if (AsyncLocalStorage) {
    _asyncRequestStore = new AsyncLocalStorage();
  } else {
    console.warn(
      '\n=====================\n' +
        '  Qwik Router Warning:\n' +
        '    AsyncLocalStorage is not available, continuing without it.\n' +
        '    This impacts concurrent async server calls, where they lose access to the ServerRequestEv object.\n' +
        '=====================\n\n'
    );
  }
}
