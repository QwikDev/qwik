import { QACTION_KEY, QFN_KEY, QLOADER_KEY, resolveRouteConfig } from './worker-imports/runtime';
import {
  resolveETag,
  resolveCacheKey,
  getCachedHtml,
  MAX_CACHE_SIZE,
  setCachedHtml,
} from '@qwik-router-ssg-worker/middleware/request-handler/etag';
import { HttpStatus } from '@qwik-router-ssg-worker/middleware/request-handler/http-status-codes';
import {
  getRequestLoaderSerializationStrategyMap,
  getRequestLoaders,
  getRequestMode,
  RequestEvETagCacheKey,
  RequestEvHttpStatusMessage,
  RequestEvIsRewrite,
  RequestEvShareQData,
  RequestEvShareServerTiming,
  RequestEvSharedActionId,
  RequestRouteName,
} from '@qwik-router-ssg-worker/middleware/request-handler/request-event-core';
import { getRouteLoaderPromise } from '@qwik-router-ssg-worker/middleware/request-handler/request-loader';
import {
  IsQData,
  QDATA_JSON,
} from '@qwik-router-ssg-worker/middleware/request-handler/request-path';
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
  QLOADER_KEY,
  QDATA_JSON,
  IsQData,
  RequestEvETagCacheKey,
  RequestEvHttpStatusMessage,
  RequestEvIsRewrite,
  RequestEvShareQData,
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
  getRequestLoaderSerializationStrategyMap,
  getRequestLoaders,
  getRequestMode,
  getRouteLoaderPromise,
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
