import { Q_ROUTE } from '../../runtime/src/constants';
import {
  getRequestRoute,
  RequestEvHttpStatusMessage,
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
  RequestEvSharedActionFormData,
  RequestEvSharedActionId,
  RequestEvSharedNonce,
  RequestRouteName,
  getRequestRoute,
};

export function getQwikRouterServerData(...args: GetQwikRouterServerDataArgs) {
  return getQwikRouterServerDataWithDeps(responsePageDeps, ...args);
}
