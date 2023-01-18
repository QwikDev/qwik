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

export type ServerActionExecute<RETURN> = QRL<
  (
    form: FormData | Record<string, string | string[] | Blob | Blob[]> | SubmitEvent
  ) => Promise<RETURN>
>;

/**
 * @alpha
 */
export interface ServerActionUse<RETURN> {
  readonly id: string;
  readonly actionPath: string;
  readonly isRunning: boolean;
  readonly status?: number;
  readonly value: RETURN | undefined;
  readonly run: ServerActionExecute<RETURN>;
}

/**
 * @alpha
 */
export interface ServerAction<RETURN> {
  readonly [isServerLoader]?: true;
  use(): ServerActionUse<RETURN>;
}

export interface ServerActionInternal extends ServerAction<any> {
  readonly __brand: 'server_action';
  __qrl: QRL<(form: FormData, event: RequestEventLoader) => ValueOrPromise<any>>;
  use(): ServerActionUse<any>;
}

type Editable<T> = {
  -readonly [P in keyof T]: T[P];
};

export class ServerActionImpl implements ServerActionInternal {
  readonly __brand = 'server_action';
  constructor(
    public __qrl: QRL<(form: FormData, event: RequestEventLoader) => ValueOrPromise<any>>
  ) {}
  use(): ServerActionUse<any> {
    const loc = useLocation() as Editable<RouteLocation>;
    const currentAction = useAction();
    const initialState: Editable<Partial<ServerActionUse<any>>> = {
      status: undefined,
      isRunning: false,
    };

    const state = useStore<Editable<ServerActionUse<any>>>(() => {
      return untrack(() => {
        const id = this.__qrl.getHash();
        if (currentAction.value?.output) {
          const { status, result } = currentAction.value.output;
          initialState.status = status;
          initialState.value = result;
        } else {
          initialState.status = undefined;
          initialState.value = undefined;
        }
        initialState.id = id;
        initialState.actionPath = `${loc.pathname}?${QACTION_KEY}=${id}`;
        initialState.isRunning = false;
        return initialState as ServerActionUse<any>;
      });
    });

    initialState.run = $((input) => {
      let data: FormData;
      if (input instanceof SubmitEvent) {
        data = new FormData(input.target as HTMLFormElement);
      } else if (input instanceof FormData) {
        data = input;
      } else {
        data = formDataFromObject(input);
      }
      return new Promise<RouteActionResolver>((resolve) => {
        state.isRunning = true;
        loc.isNavigating = true;
        currentAction.value = {
          data,
          id: state.id,
          resolve: noSerialize(resolve),
        };
      }).then((value) => {
        state.isRunning = false;
        state.status = value.status;
        state.value = value.result;
      });
    });
    return state;
  }
}

/**
 * @alpha
 */
export const actionQrl = <B>(
  actionQrl: QRL<(form: FormData, event: RequestEventLoader) => ValueOrPromise<B>>
): ServerAction<B> => {
  return new ServerActionImpl(actionQrl as any) as any;
};

/**
 * @alpha
 */
export const action$ = implicit$FirstArg(actionQrl);

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
