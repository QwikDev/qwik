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
  SSRHint,
  useRender,
  jsx,
} from '@builder.io/qwik';

import type { RequestEventLoader } from '../../middleware/request-handler/types';
import { QACTION_KEY } from './constants';
import { RouteStateContext } from './contexts';
import type { RouteActionResolver, RouteLocation } from './types';
import { useAction, useLocation } from './use-functions';
import { z } from 'zod';
import { isServer } from '@builder.io/qwik/build';
import type { FormSubmitFailDetail, FormSubmitSuccessDetail } from './form-component';

export type ServerActionExecute<RETURN, INPUT> = QRL<
  (form: FormData | INPUT | SubmitEvent) => Promise<RETURN>
>;

/**
 * @alpha
 */
export interface ServerActionUse<RETURN, INPUT> {
  readonly id: string;
  readonly actionPath: string;
  readonly isRunning: boolean;
  readonly status?: number;
  readonly formData: FormData | undefined;
  readonly value: GetValueReturn<RETURN> | undefined;
  readonly fail: GetFailReturn<RETURN> | undefined;
  readonly run: ServerActionExecute<RETURN, INPUT>;
}

export type FailReturn<T> = T & {
  __brand: 'fail';
};

export type GetValueReturn<T> = T extends FailReturn<{}> ? never : T;
export type GetFailReturn<T> = T extends FailReturn<infer I>
  ? I & { [key: string]: undefined }
  : never;

/**
 * @alpha
 */
export interface ServerAction<RETURN, INPUT = Record<string, any>> {
  readonly [isServerLoader]?: true;
  use(): ServerActionUse<RETURN, INPUT>;
}

export interface ServerActionInternal extends ServerAction<any, any> {
  readonly __brand: 'server_action';
  __qrl: QRL<(form: FormData, event: RequestEventLoader) => ValueOrPromise<any>>;
  __schema: ZodReturn | undefined;

  use(): ServerActionUse<any, any>;
}

type Editable<T> = {
  -readonly [P in keyof T]: T[P];
};

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

type JSONValue = string | number | boolean | { [x: string]: JSONValue } | Array<JSONValue>;

type DefaultActionType = { [x: string]: JSONValue };

type GetValidatorType<B extends ZodReturn<any>> = B extends ZodReturn<infer TYPE>
  ? z.infer<z.ZodObject<TYPE>>
  : never;

interface Action {
  <O>(
    actionQrl: (form: DefaultActionType, event: RequestEventLoader) => ValueOrPromise<O>
  ): ServerAction<O>;
  <O, B extends ZodReturn>(
    actionQrl: (data: GetValidatorType<B>, event: RequestEventLoader) => ValueOrPromise<O>,
    options: B
  ): ServerAction<O | FailReturn<z.typeToFlattenedError<GetValidatorType<B>>>, GetValidatorType<B>>;
}
/**
 * @alpha
 */
export const actionQrl = <B, A>(
  actionQrl: QRL<(form: DefaultActionType, event: RequestEventLoader) => ValueOrPromise<B>>,
  options?: ZodReturn
): ServerAction<B, A> => {
  return new ServerActionImpl(actionQrl as any, options) as any;
};

/**
 * @alpha
 */
export const action$: Action = implicit$FirstArg(actionQrl) as any;

type ActionOptions = z.ZodRawShape;

type ZodReturn<T extends ActionOptions = any> = Promise<z.ZodObject<T>>;

interface Zod {
  <T extends ActionOptions>(schema: T): ZodReturn<T>;
  <T extends ActionOptions>(schema: (z: typeof import('zod').z) => T): ZodReturn<T>;
}

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

/**
 * @alpha
 */
export type ServerLoaderUse<T> = Awaited<T> extends () => ValueOrPromise<infer B>
  ? Signal<ValueOrPromise<B>>
  : Signal<Awaited<T>>;

/**
 * @alpha
 */
export interface ServerLoader<RETURN> {
  readonly [isServerLoader]?: true;
  use(): ServerLoaderUse<RETURN>;
}

declare const isServerLoader: unique symbol;

export interface ServerLoaderInternal extends ServerLoader<any> {
  readonly __brand?: 'server_loader';
  __qrl: QRL<(event: RequestEventLoader) => ValueOrPromise<any>>;
  use(): Signal<any>;
}

export class ServerLoaderImpl implements ServerLoaderInternal {
  readonly __brand = 'server_loader';
  constructor(public __qrl: QRL<(event: RequestEventLoader) => ValueOrPromise<any>>) {}
  use(): Signal<any> {
    useRender(jsx(SSRHint, { dynamic: true }));

    const state = useContext(RouteStateContext);
    const hash = this.__qrl.getHash();
    untrack(() => {
      if (!(hash in state)) {
        throw new Error(`Loader not found: ${hash}`);
      }
    });
    return _wrapSignal(state, hash);
  }
}

/**
 * @alpha
 */
export const loaderQrl = <PLATFORM, B>(
  loaderQrl: QRL<(event: RequestEventLoader<PLATFORM>) => B>
): ServerLoader<B> => {
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
