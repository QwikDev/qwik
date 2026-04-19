import type { LoadedRoute, RebuildRouteInfoInternal, RequestHandler } from '../runtime/src/types';
import { type RequestEventInternal } from '../middleware/request-handler/request-event-core';
import { createRequestEvent } from './request-event-ssg';
import { type QwikRouterRun } from '../middleware/request-handler/user-response-runner';
import type { ServerRequestEvent } from '../middleware/request-handler/types';
import { _getAsyncRequestStore } from '@qwik-router-ssg-worker/middleware/request-handler/async-request-store';
import { getErrorHtml } from '@qwik-router-ssg-worker/middleware/request-handler/error-handler';
import { encoder } from '@qwik-router-ssg-worker/middleware/request-handler/request-utils';
import {
  AbortMessage,
  RedirectMessage,
} from '@qwik-router-ssg-worker/middleware/request-handler/redirect-handler';
import { RewriteMessage } from '@qwik-router-ssg-worker/middleware/request-handler/rewrite-handler';
import { ServerError } from '@qwik-router-ssg-worker/middleware/request-handler/server-error';
import { runQwikRouterWithDeps } from '@qwik-router-ssg-worker/middleware/request-handler/user-response-runner';

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
      asyncRequestStore: _getAsyncRequestStore(),
      createRequestEvent,
      encoder,
      getErrorHtml,
    }
  );
}
