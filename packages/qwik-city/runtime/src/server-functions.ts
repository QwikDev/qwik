import {
  implicit$FirstArg,
  QRL,
  ResourceReturn,
  useContext,
  useResource$,
  ValueOrPromise,
} from '@builder.io/qwik';
import { isBrowser } from '@builder.io/qwik/build';
import { RouteStateContext } from './contexts';
import type { RequestEvent } from './types';

export interface ServerAction<T extends any[], B> {
  (...body: T): Promise<B>;
}

/**
 * @alpha
 */
export const serverActionQrl = <T extends any[], B>(
  actionQrl: QRL<(...body: T) => ValueOrPromise<B>>
) => {
  if (isBrowser) {
    const action = function () {};
    Object.assign(action, { qrl: actionQrl });
    return action;
  } else {
    const action = function () {
      throw new Error('you cant call a server action from the server');
    };
    Object.assign(action, { qrl: actionQrl });
    return action;
  }
};

/**
 * @alpha
 */
export const serverAction$ = implicit$FirstArg(serverActionQrl);

export interface ServerLoader<RETURN> {
  use(): ResourceReturn<RETURN>;
}

export class ServerLoaderImpl<RETURN> implements ServerLoader<RETURN>  {
  constructor(public qrl: QRL<(event: RequestEvent) => ValueOrPromise<RETURN>>) {}
  __brand_server_loader = true;
  use(): ResourceReturn<RETURN> {
    const state = useContext(RouteStateContext);
    const hash = this.qrl.getHash();
    return useResource$<RETURN>(({ track }) => {
      track(state);
      return state.value[hash] as RETURN;
    });
  }
}

/**
 * @alpha
 */
export const serverLoaderQrl = <PLATFORM, B>(
  loaderQrl: QRL<(event: RequestEvent<PLATFORM>) => B>
): ServerLoader<Awaited<B>> => {
  return new ServerLoaderImpl<Awaited<B>>(loaderQrl as any);
};

/**
 * @alpha
 */
export const serverLoader$ = implicit$FirstArg(serverLoaderQrl);

