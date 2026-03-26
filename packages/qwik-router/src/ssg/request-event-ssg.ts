import { createCacheControl } from '@qwik-router-ssg-worker/middleware/request-handler/cache-control';
import { Cookie } from '@qwik-router-ssg-worker/middleware/request-handler/cookie';
import { createRequestEventWithDeps } from '@qwik-router-ssg-worker/middleware/request-handler/request-event-core';
import { getRouteLoaderPromise } from '@qwik-router-ssg-worker/middleware/request-handler/request-loader';
import {
  getRouteMatchPathname,
  IsQData,
} from '@qwik-router-ssg-worker/middleware/request-handler/request-path';
import {
  encoder,
  getContentType,
} from '@qwik-router-ssg-worker/middleware/request-handler/request-utils';
import {
  AbortMessage,
  RedirectMessage,
} from '@qwik-router-ssg-worker/middleware/request-handler/redirect-handler';
import { RewriteMessage } from '@qwik-router-ssg-worker/middleware/request-handler/rewrite-handler';
import { ServerError } from '@qwik-router-ssg-worker/middleware/request-handler/server-error';
import { QDATA_KEY, isPromise } from './worker-imports/runtime';

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
