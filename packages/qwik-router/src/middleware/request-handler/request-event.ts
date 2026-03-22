import { QDATA_KEY } from '../../runtime/src/constants';
import { isPromise } from '../../runtime/src/utils';
import { createCacheControl } from './cache-control';
import { Cookie } from './cookie';
import { createRequestEventWithDeps } from './request-event-core';
import { getRouteLoaderPromise } from './request-loader';
import { getRouteMatchPathname, IsQData } from './request-path';
import { AbortMessage, RedirectMessage } from './redirect-handler';
import { RewriteMessage } from './rewrite-handler';
import { ServerError } from './server-error';
import { encoder, getContentType } from './request-utils';

type CreateRequestEventArgs =
  Parameters<typeof createRequestEventWithDeps> extends [any, ...infer Rest] ? Rest : never;

const requestEventDeps = {
  QDATA_KEY,
  isPromise,
  createCacheControl,
  Cookie,
  AbortMessage,
  RedirectMessage,
  RewriteMessage,
  ServerError,
  getRouteLoaderPromise,
  getRouteMatchPathname,
  IsQData,
  encoder,
  getContentType,
};

export function createRequestEvent(...args: CreateRequestEventArgs) {
  return createRequestEventWithDeps(requestEventDeps, ...args);
}
