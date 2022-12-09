import {
  $,
  implicit$FirstArg,
  QRL,
  Signal,
  useContext,
  ValueOrPromise,
  _wrapSignal,
} from '@builder.io/qwik';
import { isBrowser } from '@builder.io/qwik/build';
import { RouteStateContext } from './contexts';
import type { RequestEvent } from './types';

export interface ServerAction<ARGS extends any[], RETURN> {
  readonly [isServerLoader]: true;

  use(): QRL<(...event: ARGS) => Promise<RETURN>>;
}

export class ServerActionImpl {
  __brand_server_loader = true;
  constructor(public __qrl: QRL<(...event: any[]) => ValueOrPromise<any>>) {}
  use(): QRL<Function> {
    return $(() => {
      // perform action
      return 'result';
    });
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

export interface ServerLoader<RETURN> {
  readonly [isServerLoader]: true;
  use(): Signal<RETURN>;
}

export class ServerLoaderImpl {
  __brand_server_loader = true;
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
): ServerLoader<Awaited<B>> => {
  return new ServerLoaderImpl(loaderQrl as any) as any as ServerLoader<Awaited<B>>;
};

/**
 * @alpha
 */
export const serverLoader$ = implicit$FirstArg(serverLoaderQrl);
