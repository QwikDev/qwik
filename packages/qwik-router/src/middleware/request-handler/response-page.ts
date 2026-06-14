import { Q_ROUTE } from '../../runtime/src/constants';
import {
  getRequestMode,
  getRequestRoute,
  RequestEvHttpStatusMessage,
  RequestEvSharedActionError,
  RequestEvSharedActionFormData,
  RequestEvSharedActionId,
  RequestEvSharedNonce,
  RequestRouteName,
} from './request-event-core';
import { getQwikRouterServerDataWithDeps } from './response-page-core';

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
