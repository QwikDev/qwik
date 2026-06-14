import {
  getRequestMode,
  getRequestRoute,
  RequestEvHttpStatusMessage,
  RequestEvSharedActionError,
  RequestEvSharedActionFormData,
  RequestEvSharedActionId,
  RequestEvSharedNonce,
  RequestRouteName,
} from '@qwik-router-ssg-worker/middleware/request-handler/request-event-core';
import { getQwikRouterServerDataWithDeps } from '@qwik-router-ssg-worker/middleware/request-handler/response-page-core';
import { Q_ROUTE } from './worker-imports/runtime';
type GetQwikRouterServerDataArgs =
  Parameters<typeof getQwikRouterServerDataWithDeps> extends [any, ...infer Rest] ? Rest : never;

const responsePageDeps = {
  Q_ROUTE,
  RequestEvHttpStatusMessage,
  RequestEvSharedActionError,
  RequestEvSharedActionFormData,
  RequestEvSharedActionId,
  RequestEvSharedNonce,
  RequestRouteName,
  getRequestMode,
  getRequestRoute,
};

export function getQwikRouterServerData(...args: GetQwikRouterServerDataArgs) {
  return getQwikRouterServerDataWithDeps(responsePageDeps, ...args);
}
