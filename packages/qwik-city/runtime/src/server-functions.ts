import {
  $,
  implicit$FirstArg,
  noSerialize,
  QRL,
  Signal,
  useContext,
  ValueOrPromise,
  _wrapSignal,
  useStore,
  untrack,
} from '@builder.io/qwik';

import type { RequestEventLoader } from '../../middleware/request-handler/types';
import { QACTION_KEY } from './constants';
import { RouteStateContext } from './contexts';
import type {
  Action,
  ActionOptions,
  Zod,
  DefaultActionType,
  FailReturn,
  RouteActionResolver,
  RouteLocation,
  ServerAction,
  ServerActionInternal,
  ServerLoader,
  ServerLoaderInternal,
  ZodReturn,
  ServerActionUse,
  Editable,
} from './types';
import { useAction, useLocation } from './use-functions';
import { z } from 'zod';
import { isServer } from '@builder.io/qwik/build';
import type { FormSubmitFailDetail, FormSubmitSuccessDetail } from './form-component';

export class ServerActionImpl implements ServerActionInternal {
  readonly __brand = 'server_action';
  constructor(
    public __qrl: QRL<(form: FormData, event: RequestEventLoader) => ValueOrPromise<any>>,
    public __schema: ZodReturn | undefined
  ) {}
  use(): ServerActionUse<any, any> {
    const loc = useLocation() as Editable<RouteLocation>;
    const currentAction = useAction();
    const initialState: Editable<Partial<ServerActionUse<any, any>>> = {
      status: undefined,
      isRunning: false,
      formData: currentAction.value?.data,
    };
    const state = useStore<Editable<ServerActionUse<any, any>>>(() => {
      return untrack(() => {
        const id = this.__qrl.getHash();
        if (currentAction.value?.output) {
          const { status, result } = currentAction.value.output;
          initialState.status = status;
          if (isFail(result)) {
            initialState.value = undefined;
            initialState.fail = result;
          } else {
            initialState.value = result;
            initialState.fail = undefined;
          }
        } else {
          initialState.status = undefined;
          initialState.value = undefined;
          initialState.fail = undefined;
        }
        initialState.id = id;
        initialState.actionPath = `${loc.pathname}?${QACTION_KEY}=${id}`;
        initialState.isRunning = false;
        return initialState as ServerActionUse<any, any>;
      });
    });

    initialState.run = $((input) => {
      let data: any;
      let form: HTMLFormElement | undefined;
      if (input instanceof SubmitEvent) {
        form = input.target as HTMLFormElement;
        data = new FormData(form);
      } else {
        data = input;
      }
      return new Promise<RouteActionResolver>((resolve) => {
        if (data instanceof FormData) {
          state.formData = data;
        }
        state.isRunning = true;
        loc.isNavigating = true;
        currentAction.value = {
          data,
          id: state.id,
          resolve: noSerialize(resolve),
        };
      }).then(({ result, status }) => {
        state.isRunning = false;
        state.status = status;
        const didFail = isFail(result);
        if (didFail) {
          initialState.value = undefined;
          initialState.fail = result;
        } else {
          initialState.value = result;
          initialState.fail = undefined;
        }
        if (form) {
          if (form.getAttribute('data-spa-reset') === 'true') {
            form.reset();
          }
          const eventName = didFail ? 'submitfail' : 'submitsuccess';
          const detail = didFail
            ? ({ status, fail: result } satisfies FormSubmitFailDetail<any>)
            : ({ status, value: result } satisfies FormSubmitSuccessDetail<any>);
          form.dispatchEvent(
            new CustomEvent(eventName, {
              bubbles: false,
              cancelable: false,
              composed: false,
              detail: detail,
            })
          );
        }
      });
    });
    return state;
  }
}

/**
 * @alpha
 */
export const actionQrl = <B, A>(
  actionQrl: QRL<(form: DefaultActionType, event: RequestEventLoader) => ValueOrPromise<B>>,
  options?: ZodReturn
): ServerAction<B, A> => {
  const action = new ServerActionImpl(actionQrl as any, options) as any;
  if (isServer) {
    if (typeof (globalThis as any)._qwikActionsMap === 'undefined') {
      (globalThis as any)._qwikActionsMap = new Map();
    }
    (globalThis as any)._qwikActionsMap.set(actionQrl.getHash(), action);
  }
  return action;
};

/**
 * @alpha
 */
export const action$: Action = implicit$FirstArg(actionQrl) as any;

/**
 * @alpha
 */
export const zodQrl = async (
  qrl: QRL<ActionOptions | ((z: typeof import('zod').z) => ActionOptions)>
) => {
  if (isServer) {
    let obj = await qrl.resolve();
    if (typeof obj === 'function') {
      obj = obj(z);
    }
    return z.object(obj);
  }
  return undefined;
};

/**
 * @alpha
 */
export const zod$: Zod = implicit$FirstArg(zodQrl) as any;

export class ServerLoaderImpl implements ServerLoaderInternal {
  readonly __brand = 'server_loader';
  constructor(public __qrl: QRL<(event: RequestEventLoader) => ValueOrPromise<any>>) {}
  use(): Signal<any> {
    return useContext(RouteStateContext, (state) => {
      const hash = this.__qrl.getHash();
      if (!(hash in state)) {
        throw new Error(`Loader not found: ${hash}`);
      }
      return _wrapSignal(state, hash);
    });
  }
}

/**
 * @alpha
 */
export const loaderQrl = <RETURN, PLATFORM = unknown>(
  loaderQrl: QRL<(event: RequestEventLoader<PLATFORM>) => RETURN>
): ServerLoader<RETURN> => {
  return new ServerLoaderImpl(loaderQrl as any) as any;
};

/**
 * @alpha
 */
export const loader$ = implicit$FirstArg(loaderQrl);

export const isFail = <T>(value: any): value is FailReturn<any> => {
  return value && typeof value === 'object' && value.__brand === 'fail';
};

export function formDataFromObject(obj: Record<string, string | string[] | Blob | Blob[]>) {
  const formData = new FormData();
  for (const key in obj) {
    const value = obj[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        formData.append(key, item);
      }
    } else {
      formData.append(key, value);
    }
  }
  return formData;
}
