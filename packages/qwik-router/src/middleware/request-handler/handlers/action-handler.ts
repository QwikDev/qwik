import { _serialize, _verifySerializable, isDev } from '@qwik.dev/core/internal';
import type {
  ActionInternal,
  DataValidator,
  JSONObject,
  RequestEvent,
  RequestHandler,
  ValidatorReturn,
} from '../../../runtime/src/types';
import {
  RequestEvSharedActionError,
  RequestEvSharedActionId,
  type RequestEventInternal,
} from '../request-event-core';
import { IsQAction, QActionId } from '../request-path';
import { ServerError } from '../server-error';
import type { QRL } from '@qwik.dev/core';
import type { RequestEventBase } from '../types';

/**
 * Handler for action requests (`?qaction={actionId}`).
 *
 * When the request has `Accept: application/json`, returns the action result as JSON. Otherwise,
 * falls through to let the page render (progressive enhancement for forms).
 *
 * If the action has no `invalidate` list, the client invalidates all current route loaders unless
 * strict loaders mode treats it as `invalidate: []`. If `invalidate` is specified, only those
 * loader hashes are sent for the client to re-fetch.
 */
export function actionHandler(routeActions: ActionInternal[]): RequestHandler {
  return async (requestEvent: RequestEvent) => {
    const requestEv = requestEvent as RequestEventInternal;

    if (!requestEv.sharedMap.has(IsQAction)) {
      return;
    }

    // Only intercept when the client accepts JSON (fetch-based submissions).
    // Otherwise, fall through to let actionsMiddleware handle it for page renders
    // (progressive enhancement for forms).
    if (!requestEv.request.headers.get('accept')?.includes('application/json')) {
      return;
    }

    if (requestEv.headersSent || requestEv.exited) {
      return;
    }

    const actionId = requestEv.sharedMap.get(QActionId) as string;
    const method = requestEv.method;
    const devMode = isDev;

    if (devMode && method === 'GET') {
      console.warn(
        'Seems like you are submitting a Qwik Action via GET request. Qwik Actions should be submitted via POST request.\nMake sure your <form> has method="POST" attribute, like this: <form method="POST">'
      );
    }

    if (method !== 'POST') {
      return;
    }

    // Find the action
    let action: ActionInternal | undefined;
    for (const routeAction of routeActions) {
      if (routeAction.__id === actionId) {
        action = routeAction;
      }
    }

    // Try global actions map if not found in route
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

    // Execute the action
    const data = await requestEv.parseBody();
    if (!data || typeof data !== 'object') {
      throw new Error(`Expected request data for the action id ${actionId} to be an object`);
    }

    const { result: actionResult, error: actionError } = await executeAction(
      action,
      data,
      requestEv,
      devMode
    );
    const responseData: Record<string, unknown> = {
      result: actionResult,
      error: actionError,
    };
    requestEv.sharedMap.set(RequestEvSharedActionId, actionId);
    requestEv.sharedMap.set('@actionResult', actionResult);
    if (actionError) {
      requestEv.sharedMap.set(RequestEvSharedActionError, actionError);
    }

    if (action.__invalidate) {
      // Action specifies which loaders to invalidate — send only hashes, client re-fetches
      responseData.loaderHashes = action.__invalidate;
    } else if (globalThis.__STRICT_LOADERS__) {
      // Strict mode treats omitted invalidate as invalidate: [].
      responseData.loaderHashes = [];
    }

    const serialized = await _serialize(responseData);
    requestEv.headers.set('Content-Type', 'application/json; charset=utf-8');
    requestEv.send(requestEv.status(), serialized);
  };
}

/**
 * Run an action's validators and QRL, routing the outcome to the two channels:
 *
 * - `result` — value placed on the action store's `.value` (success, or a deprecated `fail()` union).
 * - `error` — a `ServerError` placed on the action store's `.error`: set when the action does `return
 *   error()` (a returned `ServerError`) or when a validator fails (the deprecated `fail()` union is
 *   also returned as `result` in the validator case so `.value.failed` keeps working).
 *
 * A THROWN error (e.g. `throw error()`) propagates out and aborts the request.
 */
export async function executeAction(
  action: ActionInternal,
  data: unknown,
  requestEv: RequestEventInternal,
  devMode: boolean
): Promise<{ result: unknown; error?: ServerError }> {
  const result = await runValidators(requestEv, action.__validators, data, devMode);
  if (!result.success) {
    const status = result.status ?? 500;
    return {
      result: requestEv.fail(status, result.error as Record<string, any>),
      error: new ServerError(status, result.error),
    };
  }
  const actionResolved = devMode
    ? await measure(requestEv, action.__qrl.getHash(), () =>
        action.__qrl.call(requestEv, result.data as JSONObject, requestEv)
      )
    : await action.__qrl.call(requestEv, result.data as JSONObject, requestEv);
  if (devMode) {
    verifySerializable(actionResolved, action.__qrl);
  }
  // A RETURNED ServerError (from `return error()`) goes to the `.error` channel.
  if (actionResolved instanceof ServerError) {
    return { result: undefined, error: actionResolved };
  }
  return { result: actionResolved };
}

async function runValidators(
  requestEv: RequestEvent,
  validators: DataValidator[] | undefined,
  data: unknown,
  devMode: boolean
) {
  let lastResult: ValidatorReturn = { success: true, data };
  if (validators) {
    for (const validator of validators) {
      if (devMode) {
        lastResult = await measure(requestEv, `validator$`, () =>
          validator.validate(requestEv, data)
        );
      } else {
        lastResult = await validator.validate(requestEv, data);
      }
      if (!lastResult.success) {
        return lastResult;
      } else {
        data = lastResult.data;
      }
    }
  }
  return lastResult;
}

function verifySerializable(data: any, qrl: QRL) {
  try {
    _verifySerializable(data, undefined);
  } catch (e: any) {
    if (e instanceof Error && qrl.dev) {
      (e as any).loc = qrl.dev;
    }
    throw e;
  }
}

async function measure<T>(
  requestEv: RequestEventBase,
  name: string,
  fn: () => T
): Promise<Awaited<T>> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    let measurements = requestEv.sharedMap.get('@serverTiming');
    if (!measurements) {
      requestEv.sharedMap.set('@serverTiming', (measurements = []));
    }
    measurements.push([name, duration]);
  }
}
