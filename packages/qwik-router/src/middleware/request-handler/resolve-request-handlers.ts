import { QACTION_KEY, QFN_KEY } from '../../runtime/src/constants';
import { resolveRouteConfig } from '../../runtime/src/head';
import { resolveETag, resolveCacheKey, getCachedHtml, MAX_CACHE_SIZE, setCachedHtml } from './etag';
import { HttpStatus } from './http-status-codes';
import {
  RequestEvETagCacheKey,
  RequestEvHttpStatusMessage,
  RequestEvShareServerTiming,
  RequestEvSharedActionId,
  RequestRouteName,
  getRequestMode,
} from './request-event-core';
import { getQwikRouterServerData } from './response-page';
import { createResolveRequestHandlers } from './resolve-request-handlers-core';
import { RedirectMessage } from './redirect-handler';
import { encoder, isContentType } from './request-utils';
import { ServerError } from './server-error';

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
  loadHttpError: () => import('../../runtime/src/http-error'),
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
