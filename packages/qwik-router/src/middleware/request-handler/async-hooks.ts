import type { AsyncLocalStorage } from 'node:async_hooks';
import { isServer } from '@qwik.dev/core/build';
export let qcAsyncRequestStore: AsyncLocalStorage<RequestEventInternal> | undefined;

if (isServer) {
  import('node:async_hooks')
    .then((module) => {
      qcAsyncRequestStore = new module.AsyncLocalStorage();
    })
    .catch(() => {
      // ignore if AsyncLocalStorage is not available
    });
}
