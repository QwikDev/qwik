import { _serialize, _UNINITIALIZED, type ValueOrPromise } from '@qwik.dev/core/internal';
import type {
  ActionInternal,
  JSONObject,
  LoaderInternal,
  RequestEvent,
  RequestHandler,
} from '../../../runtime/src/types';
import {
  getRequestActions,
  getRequestLoaders,
  getRequestMode,
  type RequestEventInternal,
} from '../request-event';
import { measure, verifySerializable } from '../resolve-request-handlers';
import { IsQAction, QActionId } from '../user-response';
import { runValidators } from './validator-utils';

export function actionHandler(
  routeActions: ActionInternal[],
  routeLoaders: LoaderInternal[]
): RequestHandler {
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
    const isDev = getRequestMode(requestEv) === 'dev';
    const method = requestEv.method;

    if (isDev && method === 'GET') {
      console.warn(
        'Seems like you are submitting a Qwik Action via GET request. Qwik Actions should be submitted via POST request.\nMake sure your <form> has method="POST" attribute, like this: <form method="POST">'
      );
    }
    if (method === 'POST') {
      const actions = getRequestActions(requestEv);
      let action: ActionInternal | undefined;
      for (const routeAction of routeActions) {
        if (routeAction.__id === actionId) {
          action = routeAction;
        } else {
          // actions can use other actions
          actions[routeAction.__id] = _UNINITIALIZED;
        }
      }
      // actions can use loaders
      const loaders = getRequestLoaders(requestEv);
      for (const routeLoader of routeLoaders) {
        loaders[routeLoader.__id] = _UNINITIALIZED;
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

      await executeAction(action, actions, requestEv, isDev);

      if (requestEv.request.headers.get('accept')?.includes('application/json')) {
        // only return the action data if the client accepts json, otherwise it will return the html page (for forms)
        const data = await _serialize([actions[actionId]]);
        requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');
        requestEv.send(200, data);
        return;
      }
    }
  };
}

export async function executeAction(
  action: ActionInternal,
  actions: Record<string, ValueOrPromise<unknown> | undefined>,
  requestEv: RequestEventInternal,
  isDev: boolean
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
      verifySerializable(actionResolved, action.__qrl);
    }
    actions[selectedActionId] = actionResolved;
  }
}
