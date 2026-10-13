import { isServer } from '@qwik.dev/core/build';
import { _getAsyncLocalStorage, _qwikSymbol, _registerSingleton } from '@qwik.dev/core/internal';
import type { AsyncLocalStorage } from 'node:async_hooks';
import type { QwikRouterConfig } from '../../runtime/src/types';
import type { RequestEventInternal } from './request-event-core';

const createRequestStore = (): AsyncLocalStorage<RequestEventInternal> | undefined => {
  const AsyncLocalStorage = _getAsyncLocalStorage();
  if (AsyncLocalStorage) {
    return new AsyncLocalStorage();
  }
  console.warn(
    '\n=====================\n' +
      '  Qwik Router Warning:\n' +
      '    AsyncLocalStorage is not available, continuing without it.\n' +
      '    This impacts concurrent async server calls, where they lose access to the ServerRequestEv object.\n' +
      '=====================\n\n'
  );
  return undefined;
};

/**
 * Shared with the router copy of a Qwik library kept external on the server, so its
 * `getRequestEvent()` and `server$` see the request the app is serving.
 *
 * @internal
 */
export const _asyncRequestStore: AsyncLocalStorage<RequestEventInternal> | undefined = isServer
  ? _registerSingleton('routerRequestStore', createRequestStore)
  : undefined;

/** The request event's key for the config of the app serving it. */
export const RequestEvRouterConfig: unique symbol = /*#__PURE__*/ _qwikSymbol('router.config');

/** The config of the app serving the current request, for a router copy that holds none. */
export const getServingRouterConfig = (): QwikRouterConfig | undefined =>
  _asyncRequestStore?.getStore()?.[RequestEvRouterConfig];
