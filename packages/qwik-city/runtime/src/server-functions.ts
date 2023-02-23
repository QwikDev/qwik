import {
  $,
  implicit$FirstArg,
  noSerialize,
  QRL,
  useContext,
  ValueOrPromise,
  _wrapSignal,
  useStore,
  _serializeData,
  _deserializeData,
  _getContextElement,
} from '@builder.io/qwik';

import type { RequestEventLoader } from '../../middleware/request-handler/types';
import { QACTION_KEY } from './constants';
import { RouteStateContext } from './contexts';
import type {
  ActionConstructor,
  Zod,
  JSONObject,
  RouteActionResolver,
  RouteLocation,
  Action,
  Loader,
  ZodReturn,
  Editable,
  ActionStore,
  RequestEvent,
  ActionInternal,
  LoaderInternal,
  RequestEventAction,
  ActionOptionsWithValidation,
} from './types';
import { useAction, useLocation } from './use-functions';
import { z } from 'zod';
import { isDev, isServer } from '@builder.io/qwik/build';
import type { FormSubmitCompletedDetail } from './form-component';

/**
 * @alpha
 */
export const actionQrl = <B, A>(
  actionQrl: QRL<(form: JSONObject, event: RequestEventAction) => ValueOrPromise<B>>,
  options?: ActionOptionsWithValidation<ZodReturn> | ZodReturn
): Action<B, A> => {
  let _id: string | undefined;
  let schema: ZodReturn | undefined;
  if (options && typeof options === 'object') {
    if (options instanceof Promise) {
      schema = options;
    } else {
      _id = options.id;
      schema = options.validation;
    }
  }
  const id = getId(actionQrl, _id);
  function action() {
    const loc = useLocation() as Editable<RouteLocation>;
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
  action.__brand = 'server_action' as const;
  action.__schema = schema;
  action.__qrl = actionQrl;
  action.__id = id;
  action.use = action;
  if (isServer) {
    if (typeof (globalThis as any)._qwikActionsMap === 'undefined') {
      (globalThis as any)._qwikActionsMap = new Map();
    }
    (globalThis as any)._qwikActionsMap.set(id, action);
  }

  return action satisfies ActionInternal;
};

/**
 * @alpha
 */
export const action$: ActionConstructor = /*#__PURE__*/ implicit$FirstArg(actionQrl) as any;

/**
 * @alpha
 */
export interface LoaderOptions {
  id?: string;
}

/**
 * @alpha
 */
export const loaderQrl = <RETURN>(
  loaderQrl: QRL<(event: RequestEventLoader) => RETURN>,
  options?: LoaderOptions
): Loader<RETURN> => {
  const id = getId(loaderQrl, options?.id);
  function loader() {
    return useContext(RouteStateContext, (state) => {
      if (!(id in state)) {
        throw new Error(`Loader (${id}) was used in a path where the 'loader$' was not declared.
    This is likely because the used loader was not exported in a layout.tsx or index.tsx file of the existing route.
    For more information check: https://qwik.builder.io/qwikcity/loader`);
      }
      return _wrapSignal(state, id);
    });
  }
  loader.__brand = 'server_loader' as const;
  loader.__qrl = loaderQrl;
  loader.__id = id;
  loader.use = loader;

  return loader satisfies LoaderInternal;
};

/**
 * @alpha
 */
export const loader$ = /*#__PURE__*/ implicit$FirstArg(loaderQrl);

/**
 * @alpha
 */
export const zodQrl = async (
  qrl: QRL<z.ZodRawShape | z.Schema | ((z: typeof import('zod').z) => z.ZodRawShape)>
) => {
  if (isServer) {
    let obj = await qrl.resolve();
    if (typeof obj === 'function') {
      obj = obj(z);
    } else if (obj instanceof z.Schema) {
      return obj;
    }
    return z.object(obj);
  }
  return undefined;
};

/**
 * @alpha
 */
export const zod$: Zod = /*#__PURE__*/ implicit$FirstArg(zodQrl) as any;

export interface Server {
  <T extends (ev: RequestEvent, ...args: any[]) => any>(fn: T): T extends (
    ev: RequestEvent,
    ...args: infer ARGS
  ) => infer RETURN
    ? QRL<(...args: ARGS) => RETURN>
    : never;
}

export const getId = (qrl: QRL<any>, id?: string) => {
  if (typeof id === 'string') {
    if (isDev) {
      if (!/^[\w/.-]+$/.test(id)) {
        throw new Error(`Invalid id: ${id}, id can only contain [a-zA-Z0-9_.-]`);
      }
    }
    return `id_${id}`;
  }
  return qrl.getHash();
};

/**
 * @alpha
 */
export const serverQrl = <T extends (...args: any[]) => any>(qrl: QRL<T>): QRL<T> => {
  if (isServer) {
    const captured = qrl.getCaptured();
    if (captured && captured.length > 0 && !_getContextElement()) {
      throw new Error('For security reasons, we cannot serialize QRLs that capture lexical scope.');
    }
  }
  function client() {
    return $(async (...args: any[]) => {
      if (isServer) {
        throw new Error(`Server functions can not be invoked within the server during SSR.`);
      } else {
        const filtered = args.map((arg) => {
          if (arg instanceof Event) {
            return null;
          } else if (arg instanceof Node) {
            return null;
          }
          return arg;
        });
        const hash = qrl.getHash();
        const path = `?qfunc=${qrl.getHash()}`;
        const body = await _serializeData([qrl, ...filtered], false);
        const res = await fetch(path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/qwik-json',
            'X-QRL': hash,
          },
          body,
        });
        if (!res.ok) {
          throw new Error(`Server function failed: ${res.statusText}`);
        }
        const str = await res.text();
        const obj = await _deserializeData(str);
        return obj;
      }
    }) as QRL<T>;
  }
  return client();
};

/**
 * @alpha
 */
export const server$: Server = /*#__PURE__*/ implicit$FirstArg(serverQrl) as any;
