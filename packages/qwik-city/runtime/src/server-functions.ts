import {
  $,
  implicit$FirstArg,
  jsx,
  noSerialize,
  QRL,
  ResourceReturn,
  Signal,
  useContext,
  ValueOrPromise,
  _wrapSignal,
  QwikJSX,
  useStore,
  untrack,
} from '@builder.io/qwik';
import type { RequestEventLoader } from '../../middleware/request-handler/types';
import { RouteStateContext } from './contexts';
import type { RouteActionResolver, RouteLocation } from './types';
import { useAction, useLocation } from './use-functions';

export type ServerActionExecute<RETURN> = QRL<
  (
    form: FormData | Record<string, string | string[] | Blob | Blob[]> | SubmitEvent
  ) => Promise<RETURN>
>;

export interface ServerActionUtils<RETURN> {
  readonly id: string;
  readonly actionPath: string;
  readonly isPending: boolean;
  readonly status: 'initial' | 'success' | 'fail';
  readonly value: RETURN | undefined;
  readonly execute: ServerActionExecute<RETURN>;
}

export interface ServerAction<RETURN> {
  readonly [isServerLoader]?: true;
  use(): ServerActionUtils<RETURN>;
}

export interface ServerActionInternal extends ServerAction<any> {
  readonly __brand: 'server_action';
  __qrl: QRL<(form: FormData, event: RequestEventLoader) => ValueOrPromise<any>>;
  use(): ServerActionUtils<any>;
}

type Editable<T> = {
  -readonly [P in keyof T]: T[P];
};

export class ServerActionImpl implements ServerActionInternal {
  readonly __brand = 'server_action';
  constructor(
    public __qrl: QRL<(form: FormData, event: RequestEventLoader) => ValueOrPromise<any>>
  ) {}
  use(): ServerActionUtils<any> {
    const loc = useLocation() as Editable<RouteLocation>;
    const currentAction = useAction();
    const initialState: Editable<Partial<ServerActionUtils<any>>> = {
      status: 'initial',
      isPending: false,
    };

    const state = useStore<Editable<ServerActionUtils<any>>>(() => {
      return untrack(() => {
        const id = this.__qrl.getHash();
        const actionPath = loc.pathname + `?qaction=${id}`;

        let statusStr: 'initial' | 'success' | 'fail' = 'initial';
        let value = undefined;
        if (currentAction.value?.output) {
          const { status, result } = currentAction.value.output;
          if (status >= 300) {
            statusStr = 'fail';
          } else {
            statusStr = 'success';
          }
          value = result;
        }
        initialState.id = id;
        initialState.actionPath = actionPath;
        initialState.status = statusStr;
        initialState.value = value;
        initialState.isPending = false;
        return initialState as ServerActionUtils<any>;
      });
    });

    initialState.execute = $((input) => {
      let data: FormData;
      if (input instanceof SubmitEvent) {
        data = new FormData(input.target as HTMLFormElement);
      } else if (input instanceof FormData) {
        data = input;
      } else {
        data = new FormData();
        for (const key in input) {
          const value = input[key];
          if (Array.isArray(value)) {
            for (const item of value) {
              data.append(key, item);
            }
          } else {
            data.append(key, value);
          }
        }
      }

      return new Promise<RouteActionResolver>((resolve) => {
        state.isPending = true;
        loc.isPending = true;
        currentAction.value = noSerialize({
          data,
          id: state.id,
          resolve,
        });
      }).then((value) => {
        state.isPending = false;
        state.status = value.status >= 300 ? 'fail' : 'success';
        state.value = value.result;
      });
    });
    return state;
  }
}

/**
 * @alpha
 */
export const serverActionQrl = <B>(
  actionQrl: QRL<(form: FormData, event: RequestEventLoader) => ValueOrPromise<B>>
): ServerAction<B> => {
  return new ServerActionImpl(actionQrl as any) as any;
};

/**
 * @alpha
 */
export const serverAction$ = implicit$FirstArg(serverActionQrl);

export type ServerLoaderUse<T> = Awaited<T> extends () => ValueOrPromise<infer B>
  ? ResourceReturn<B>
  : Signal<Awaited<T>>;

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
    const state = useContext(RouteStateContext);
    const hash = this.__qrl.getHash();
    return _wrapSignal(state, hash);
  }
}

/**
 * @alpha
 */
export const serverLoaderQrl = <PLATFORM, B>(
  loaderQrl: QRL<(event: RequestEventLoader<PLATFORM>) => B>
): ServerLoader<B> => {
  return new ServerLoaderImpl(loaderQrl as any) as any;
};

/**
 * @alpha
 */
export const serverLoader$ = implicit$FirstArg(serverLoaderQrl);

/**
 * @alpha
 */
export interface FormProps<T> extends Omit<QwikJSX.IntrinsicElements['form'], 'action'> {
  action: ServerActionUtils<T>;
}

/**
 * @alpha
 */
export const Form = <T>({ action, ...rest }: FormProps<T>) => {
  return jsx('form', {
    action: action.actionPath,
    method: 'POST',
    'preventdefault:submit': true,
    onSubmit$: action.execute,
    ...rest,
  });
};
