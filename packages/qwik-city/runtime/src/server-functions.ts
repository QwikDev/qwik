import {
  $,
  FunctionComponent,
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
} from '@builder.io/qwik';
import { RouteStateContext } from './contexts';
import type { RequestEventLoader } from './types';
import { useAction, useLocation } from './use-functions';

export interface ServerActionInternal {
  readonly __brand: 'server_action';
  __qrl: QRL<(form: FormData, event: RequestEventLoader) => ValueOrPromise<any>>;
  use(): ServerActionUtils<any>;
}

export interface ServerActionUtils<RETURN> {
  id: string;
  Form: FunctionComponent<QwikJSX.IntrinsicElements['form']>;
  actionPath: string;
  execute: QRL<(form: FormData | Record<string, string> | SubmitEvent) => Promise<RETURN>>;
}

export interface ServerAction<RETURN> {
  readonly [isServerLoader]: true;

  use(): ServerActionUtils<RETURN>;
}

export class ServerActionImpl implements ServerActionInternal {
  readonly __brand = 'server_action';
  constructor(
    public __qrl: QRL<(form: FormData, event: RequestEventLoader) => ValueOrPromise<any>>
  ) {}
  use(): ServerActionUtils<any> {
    const loc = useLocation();
    const currentAction = useAction();
    const id = this.__qrl.getHash();

    const path = loc.pathname + `?qaction=${id}`;
    const execute = $((input: FormData | SubmitEvent) => {
      const data =
        input instanceof SubmitEvent ? new FormData(input.target as HTMLFormElement) : input;
      return new Promise<any>((resolve) => {
        currentAction.value = noSerialize({
          data,
          id,
          resolve,
        });
      });
    });

    return {
      id,
      actionPath: path,
      Form: (props: any) => {
        return jsx('form', {
          action: path,
          method: 'POST',
          'preventdefault:submit': true,
          onSubmit$: execute,
          ...props,
        });
      },
      execute: execute,
    } as any;
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

declare const isServerLoader: unique symbol;

export interface ServerLoaderInternal {
  readonly __brand: 'server_loader';
  __qrl: QRL<(event: RequestEventLoader) => ValueOrPromise<any>>;
  use(): Signal<any>;
}

export type ServerLoaderUse<T> = Awaited<T> extends () => ValueOrPromise<infer B>
  ? ResourceReturn<B>
  : Signal<Awaited<T>>;

export interface ServerLoader<RETURN> {
  readonly [isServerLoader]: true;
  use(): ServerLoaderUse<RETURN>;
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
