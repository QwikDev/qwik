import { QACTION_KEY, QFN_KEY, resolveRouteConfig } from './worker-imports/runtime';
import {
  resolveETag,
  resolveCacheKey,
  getCachedHtml,
  MAX_CACHE_SIZE,
  setCachedHtml,
} from '@qwik-router-ssg-worker/middleware/request-handler/etag';
import { HttpStatus } from '@qwik-router-ssg-worker/middleware/request-handler/http-status-codes';
import {
  getRequestMode,
  RequestEvETagCacheKey,
  RequestEvHttpStatusMessage,
  RequestEvShareServerTiming,
  RequestEvSharedActionId,
  RequestRouteName,
} from '@qwik-router-ssg-worker/middleware/request-handler/request-event-core';
import {
  encoder,
  isContentType,
} from '@qwik-router-ssg-worker/middleware/request-handler/request-utils';
import { RedirectMessage } from '@qwik-router-ssg-worker/middleware/request-handler/redirect-handler';
import { createResolveRequestHandlers } from '@qwik-router-ssg-worker/middleware/request-handler/resolve-request-handlers-core';
import { ServerError } from '@qwik-router-ssg-worker/middleware/request-handler/server-error';
import { getQwikRouterServerData } from './response-page-ssg';

const requestHandlers = createResolveRequestHandlers({
  QACTION_KEY,
  QFN_KEY,
  RequestEvETagCacheKey,
  RequestEvHttpStatusMessage,
  RequestEvShareServerTiming,
  RequestEvSharedActionId,
  RequestRouteName,
  RedirectMessage,
  ServerError,
  HttpStatus,
  encoder,
  isContentType,
  getCachedHtml,
  getQwikRouterServerData,
  getRequestMode,
  loadHttpError: () => import('../runtime/src/http-error'),
  MAX_CACHE_SIZE,
  resolveCacheKey,
  resolveETag,
  resolveRouteConfig,
  setCachedHtml,
});

export const {
  actionsMiddleware,
  checkBrand,
  checkCSRF,
  fixTrailingSlash,
  getPathname,
  isLastModulePageRoute,
  isQrl,
  loadersMiddleware,
  measure,
  renderQwikMiddleware,
  resolveRequestHandlers,
  verifySerializable,
} = requestHandlers;
