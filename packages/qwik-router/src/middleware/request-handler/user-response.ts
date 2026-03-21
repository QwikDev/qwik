import type {
  LoadedRoute,
  RebuildRouteInfoInternal,
  RequestHandler,
} from '../../runtime/src/types';
import { _asyncRequestStore } from './async-request-store';
import { getErrorHtml } from './error-handler';
import { type RequestEventInternal } from './request-event-core';
import { createRequestEvent } from './request-event';
import { AbortMessage, RedirectMessage } from './redirect-handler';
import { encoder } from './request-utils';
import { RewriteMessage } from './rewrite-handler';
import { ServerError } from './server-error';
import { type QwikRouterRun, runQwikRouterWithDeps } from './user-response-runner';
import type { ServerRequestEvent } from './types';
export type { QwikRouterRun } from './user-response-runner';

export function runQwikRouter<T>(
  serverRequestEv: ServerRequestEvent<T>,
  loadedRoute: LoadedRoute,
  requestHandlers: RequestHandler<any>[],
  rebuildRouteInfo: RebuildRouteInfoInternal,
  basePathname = '/'
): QwikRouterRun<T> {
  return runQwikRouterWithDeps<T, RequestEventInternal>(
    serverRequestEv,
    loadedRoute,
    requestHandlers,
    rebuildRouteInfo,
    basePathname,
    {
      AbortMessage,
      RedirectMessage,
      RewriteMessage,
      ServerError,
      asyncRequestStore: _asyncRequestStore,
      createRequestEvent,
      encoder,
      getErrorHtml,
    }
  );
}
