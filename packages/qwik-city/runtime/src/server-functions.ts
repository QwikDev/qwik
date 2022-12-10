import {
  implicit$FirstArg,
  JSXNode,
  QRL,
  ResourceReturn,
  Signal,
  useContext,
  ValueOrPromise,
  _wrapSignal,
} from '@builder.io/qwik';
import { isBrowser } from '@builder.io/qwik/build';
import { RouteStateContext } from './contexts';
import type { RequestEvent } from './types';

export interface ServerActionInternal {
  readonly __brand: 'server_action';
  __qrl: QRL<(...event: any[]) => ValueOrPromise<any>>;
  use(): ServerActionUtils<any, any>;
}

export interface ServerActionUtils<ARG, RETURN> {
  Form: () => JSXNode;
  action: QRL<(event: ARG) => Promise<RETURN>>;
}

export interface ServerAction<ARG, RETURN> {
  readonly [isServerLoader]: true;

  use(): ServerActionUtils<ARG, RETURN>;
}

export class ServerActionImpl implements ServerActionInternal {
  readonly __brand = 'server_action';
  constructor(public __qrl: QRL<(...event: any[]) => ValueOrPromise<any>>) {}
  use(): ServerActionUtils<any, any> {
    return {} as any;
  }
}

/**
 * @alpha
 */
export const serverActionQrl = <T extends any[], B>(
  actionQrl: QRL<(...body: T) => ValueOrPromise<B>>
) => {
  if (isBrowser) {
    const action = function () {};
    Object.assign(action, { __qrl: actionQrl });
    return action;
  } else {
    const action = function () {
      throw new Error('you cant call a server action from the server');
    };
    Object.assign(action, { __qrl: actionQrl });
    return action;
  }
};

/**
 * @alpha
 */
export const serverAction$ = implicit$FirstArg(serverActionQrl);

declare const isServerLoader: unique symbol;

export interface ServerLoaderInternal {
  readonly __brand: 'server_loader';
  __qrl: QRL<(event: RequestEvent) => ValueOrPromise<any>>;
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
  constructor(public __qrl: QRL<(event: RequestEvent) => ValueOrPromise<any>>) {}
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
  loaderQrl: QRL<(event: RequestEvent<PLATFORM>) => B>
): ServerLoader<B> => {
  return new ServerLoaderImpl(loaderQrl as any) as any;
};

/**
 * @alpha
 */
export const serverLoader$ = implicit$FirstArg(serverLoaderQrl);
