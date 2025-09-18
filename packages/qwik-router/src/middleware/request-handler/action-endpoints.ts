import type {
  ActionInternal,
  JSONObject,
  RequestEvent,
  RequestHandler,
} from '../../runtime/src/types';
import { runValidators } from './loader-endpoints';
import {
  getRequestActions,
  getRequestMode,
  RequestEvQwikSerializer,
  type RequestEventInternal,
} from './request-event';
import { measure, verifySerializable } from './resolve-request-handlers';
import type { QwikSerializer } from './types';
import { IsQAction, QActionId } from './user-response';
import { _UNINITIALIZED, type ValueOrPromise } from '@qwik.dev/core/internal';

export function actionHandler(routeActions: ActionInternal[]): RequestHandler {
  return async (requestEvent: RequestEvent) => {
    const requestEv = requestEvent as RequestEventInternal;

    const isQAction = requestEv.sharedMap.has(IsQAction);
    if (!isQAction) {
      return;
    }

    if (requestEv.headersSent || requestEv.exited) {
      return;
    }
    const actionId = requestEv.sharedMap.get(QActionId);

    // Execute just this action
    const actions = getRequestActions(requestEv);
    const isDev = getRequestMode(requestEv) === 'dev';
    const qwikSerializer = requestEv[RequestEvQwikSerializer];
    const method = requestEv.method;

    if (isDev && method === 'GET') {
      console.warn(
        'Seems like you are submitting a Qwik Action via GET request. Qwik Actions should be submitted via POST request.\nMake sure your <form> has method="POST" attribute, like this: <form method="POST">'
      );
    }
    if (method === 'POST') {
      let action: ActionInternal | undefined;
      for (const routeAction of routeActions) {
        if (routeAction.__id === actionId) {
          action = routeAction;
          break;
        }
        // TODO: do we need to initialize the rest with _UNINITIALIZED?
      }
      if (!action) {
        const serverActionsMap = globalThis._qwikActionsMap as
          | Map<string, ActionInternal>
          | undefined;
        action = serverActionsMap?.get(actionId);
      }

      if (!action) {
        requestEv.json(404, { error: 'Action not found' });
        return;
      }

      await executeAction(action, actions, requestEv, isDev, qwikSerializer);

      if (requestEv.request.headers.get('accept')?.includes('application/json')) {
        // only return the action data if the client accepts json, otherwise return the html page
        const data = await qwikSerializer._serialize([actions[actionId]]);
        requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');
        requestEv.send(200, data);
        return;
      }
    }
  };
}

async function executeAction(
  action: ActionInternal,
  actions: Record<string, ValueOrPromise<unknown> | undefined>,
  requestEv: RequestEventInternal,
  isDev: boolean,
  qwikSerializer: QwikSerializer
) {
  const selectedActionId = action.__id;
  requestEv.sharedMap.set(QActionId, selectedActionId);
  const data = await requestEv.parseBody();
  if (!data || typeof data !== 'object') {
    throw new Error(`Expected request data for the action id ${selectedActionId} to be an object`);
  }
  const result = await runValidators(requestEv, action.__validators, data, isDev);
  if (!result.success) {
    actions[selectedActionId] = requestEv.fail(result.status ?? 500, result.error);
  } else {
    const actionResolved = isDev
      ? await measure(requestEv, action.__qrl.getHash(), () =>
          action.__qrl.call(requestEv, result.data as JSONObject, requestEv)
        )
      : await action.__qrl.call(requestEv, result.data as JSONObject, requestEv);
    if (isDev) {
      verifySerializable(qwikSerializer, actionResolved, action.__qrl);
    }
    actions[selectedActionId] = actionResolved;
  }
}
