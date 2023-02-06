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
} from '@builder.io/qwik';

import type {
  RequestEventAction,
  RequestEventLoader,
} from '../../middleware/request-handler/types';
import { QACTION_KEY } from './constants';
import { RouteStateContext } from './contexts';
import type {
  ActionConstructor,
  ActionOptions,
  Zod,
  JSONObject,
  RouteActionResolver,
  RouteLocation,
  Action,
  ActionInternal,
  Loader,
  LoaderInternal,
  ZodReturn,
  Editable,
  ActionStore,
} from './types';
import { useAction, useLocation } from './use-functions';
import { z } from 'zod';
import { isServer } from '@builder.io/qwik/build';
import type { FormSubmitCompletedDetail } from './form-component';

class ActionImpl implements ActionInternal {
  readonly __brand = 'server_action';
  constructor(
    public __qrl: QRL<(form: FormData, event: RequestEventAction) => ValueOrPromise<any>>,
    public __schema: ZodReturn | undefined
  ) {}
  use(): ActionStore<any, any> {
    const loc = useLocation() as Editable<RouteLocation>;
    const id = this.__qrl.getHash();
    const currentAction = useAction();
    const initialState: Editable<Partial<ActionStore<any, any>>> = {
      actionPath: `?${QACTION_KEY}=${id}`,
      isRunning: false,
      status: undefined,
      value: undefined,
      formData: undefined,
    };
    const state = useStore<Editable<ActionStore<any, any>>>(() => {
      const value = currentAction.value;
      if (value && value?.id === id) {
        const data = value.data;
        if (data instanceof FormData) {
          initialState.formData = data;
        }
        if (value.output) {
          const { status, result } = value.output;
          initialState.status = status;
          initialState.value = result;
        }
      }
      return initialState as ActionStore<any, any>;
    });

    initialState.run = $((input: any | FormData | SubmitEvent = {}) => {
      if (isServer) {
        throw new Error(`Actions can not be invoked within the server during SSR.
Action.run() can only be called on the browser, for example when a user clicks a button, or submits a form.`);
      }
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
          id,
          resolve: noSerialize(resolve),
        };
      }).then(({ result, status }) => {
        state.isRunning = false;
        state.status = status;
        state.value = result;
        if (form) {
          if (form.getAttribute('data-spa-reset') === 'true') {
            form.reset();
          }
          const detail = { status, value: result } satisfies FormSubmitCompletedDetail<any>;
          form.dispatchEvent(
            new CustomEvent('submitcompleted', {
              bubbles: false,
              cancelable: false,
              composed: false,
              detail: detail,
            })
          );
        }
        return {
          status: status,
          value: result,
        };
      });
    });
    return state;
  }
}

/**
 * @alpha
 */
export const actionQrl = <B, A>(
  actionQrl: QRL<(form: JSONObject, event: RequestEventLoader) => ValueOrPromise<B>>,
  options?: ZodReturn
): Action<B, A> => {
  const action = new ActionImpl(actionQrl as any, options) as any;
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
export const action$: ActionConstructor = implicit$FirstArg(actionQrl) as any;

export class LoaderImpl implements LoaderInternal {
  readonly __brand = 'server_loader';
  constructor(public __qrl: QRL<(event: RequestEventLoader) => ValueOrPromise<any>>) {}
  use(): Signal<any> {
    return useContext(RouteStateContext, (state) => {
      const hash = this.__qrl.getHash();
      if (!(hash in state)) {
        throw new Error(`Loader was used in a path where the 'loader$' was not declared.
This is likely because the used loader was not exported in a layout.tsx or index.tsx file of the existing route.
For more information check: https://qwik.builder.io/qwikcity/loader`);
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
): Loader<RETURN> => {
  return new LoaderImpl(loaderQrl as any) as any;
};

/**
 * @alpha
 */
export const loader$ = implicit$FirstArg(loaderQrl);

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
