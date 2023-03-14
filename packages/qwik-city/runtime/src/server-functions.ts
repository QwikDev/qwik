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
  ZodConstructor,
  JSONObject,
  RouteActionResolver,
  RouteLocation,
  Editable,
  ActionStore,
  RequestEvent,
  ActionInternal,
  LoaderInternal,
  RequestEventAction,
  CommonLoaderActionOptions,
  DataValidator,
  ValidatorReturn,
  LoaderConstructor,
  ValidatorConstructor,
  ActionConstructorQRL,
  LoaderConstructorQRL,
  ZodConstructorQRL,
  ValidatorConstructorQRL,
  ServerConstructorQRL,
} from './types';
import { useAction, useLocation } from './use-functions';
import { z } from 'zod';
import { isDev, isServer } from '@builder.io/qwik/build';
import type { FormSubmitCompletedDetail } from './form-component';

/**
 * @alpha
 */
export const routeActionQrl = ((
  actionQrl: QRL<(form: JSONObject, event: RequestEventAction) => any>,
  ...rest: (CommonLoaderActionOptions | DataValidator)[]
) => {
  const { id, validators } = getValidators(rest, actionQrl);
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
  action.__validators = validators;
  action.__qrl = actionQrl;
  action.__id = id;
  action.use = action;

  return action satisfies ActionInternal;
}) as unknown as ActionConstructorQRL;

/**
 * @alpha
 */
export const globalActionQrl = ((
  actionQrl: QRL<(form: JSONObject, event: RequestEventAction) => any>,
  ...rest: (CommonLoaderActionOptions | DataValidator)[]
) => {
  const action = (routeActionQrl as any)(actionQrl, ...rest);
  if (isServer) {
    if (typeof (globalThis as any)._qwikActionsMap === 'undefined') {
      (globalThis as any)._qwikActionsMap = new Map();
    }
    (globalThis as any)._qwikActionsMap.set(action.__id, action);
  }
  return action;
}) as ActionConstructorQRL;

/**
 * @alpha
 */
export const routeAction$: ActionConstructor = /*#__PURE__*/ implicit$FirstArg(
  routeActionQrl
) as any;

/**
 * @alpha
 */
export const globalAction$: ActionConstructor = /*#__PURE__*/ implicit$FirstArg(
  globalActionQrl
) as any;

/**
 * @alpha
 */
export const routeLoaderQrl = ((
  loaderQrl: QRL<(event: RequestEventLoader) => unknown>,
  ...rest: (CommonLoaderActionOptions | DataValidator)[]
): LoaderInternal => {
  const { id, validators } = getValidators(rest, loaderQrl);
  function loader() {
    return useContext(RouteStateContext, (state) => {
      if (!(id in state)) {
        throw new Error(`Loader (${id}) was used in a path where the 'loader$' was not declared.
    This is likely because the used loader was not exported in a layout.tsx or index.tsx file of the existing route.
    For more information check: https://qwik.builder.io/qwikcity/route-loader/`);
      }
      return _wrapSignal(state, id);
    });
  }
  loader.__brand = 'server_loader' as const;
  loader.__qrl = loaderQrl;
  loader.__validators = validators;
  loader.__id = id;
  loader.use = loader;

  return loader;
}) as LoaderConstructorQRL;

/**
 * @alpha
 */
export const routeLoader$: LoaderConstructor = /*#__PURE__*/ implicit$FirstArg(routeLoaderQrl);

/**
 * @alpha
 */
export const validatorQrl = ((
  validator: QRL<(ev: RequestEvent, data: unknown) => ValueOrPromise<ValidatorReturn>>
): DataValidator => {
  if (isServer) {
    return {
      validate: validator,
    };
  }
  return undefined as any;
}) as ValidatorConstructorQRL;

/**
 * @alpha
 */
export const validator$: ValidatorConstructor = /*#__PURE__*/ implicit$FirstArg(validatorQrl);

/**
 * @alpha
 */
export const zodQrl = ((
  qrl: QRL<z.ZodRawShape | z.Schema | ((z: typeof import('zod').z) => z.ZodRawShape)>
): DataValidator => {
  if (isServer) {
    const schema: Promise<z.Schema> = qrl.resolve().then((obj) => {
      if (typeof obj === 'function') {
        obj = obj(z);
      }
      if (obj instanceof z.Schema) {
        return obj;
      } else {
        return z.object(obj);
      }
    });
    return {
      async validate(ev, inputData) {
        const data = inputData ?? (await ev.parseBody());
        const result = await (await schema).safeParseAsync(data);
        if (result.success) {
          return result;
        } else {
          if (isDev) {
            console.error(
              '\nVALIDATION ERROR\naction$() zod validated failed',
              '\n  - Issues:',
              result.error.issues
            );
          }
          return {
            success: false,
            status: 400,
            error: result.error.flatten(),
          };
        }
      },
    };
  }
  return undefined as any;
}) as ZodConstructorQRL;

/**
 * @alpha
 */
export const zod$: ZodConstructor = /*#__PURE__*/ implicit$FirstArg(zodQrl) as any;

/**
 * @alpha
 */
export const serverQrl: ServerConstructorQRL = (qrl) => {
  if (isServer) {
    const captured = qrl.getCaptured();
    if (captured && captured.length > 0 && !_getContextElement()) {
      throw new Error('For security reasons, we cannot serialize QRLs that capture lexical scope.');
    }
  }

  function stuff() {
    return $(async (...args: any[]) => {
      if (isServer) {
        return qrl(...(args as any));
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
    }) as any;
  }
  return stuff();
};

/**
 * @alpha
 */
export const server$ = /*#__PURE__*/ implicit$FirstArg(serverQrl);

const getValidators = (rest: (CommonLoaderActionOptions | DataValidator)[], qrl: QRL<any>) => {
  let id: string | undefined;
  const validators: DataValidator[] = [];
  if (rest.length === 1) {
    const options = rest[0];
    if (options && typeof options === 'object') {
      if ('validate' in options) {
        validators.push(options);
      } else {
        id = options.id;
        if (options.validation) {
          validators.push(...options.validation);
        }
      }
    }
  } else if (rest.length > 1) {
    validators.push(...(rest.filter((v) => !!v) as any));
  }

  if (typeof id === 'string') {
    if (isDev) {
      if (!/^[\w/.-]+$/.test(id)) {
        throw new Error(`Invalid id: ${id}, id can only contain [a-zA-Z0-9_.-]`);
      }
    }
    id = `id_${id}`;
  } else {
    id = qrl.getHash();
  }
  return {
    validators: validators.reverse(),
    id,
  };
};

/**
 * @alpha
 * @deprecated - use `globalAction$()` instead
 */
export const actionQrl = globalActionQrl;

/**
 * @alpha
 * @deprecated - use `globalAction$()` instead
 */
export const action$ = globalAction$;

/**
 * @alpha
 * @deprecated - use `routeLoader$()` instead
 */
export const loaderQrl = routeLoaderQrl;

/**
 * @alpha
 * @deprecated - use `routeLoader$()` instead
 */
export const loader$ = routeLoader$;
