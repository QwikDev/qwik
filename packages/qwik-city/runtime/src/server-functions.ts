import {
  createContext,
  implicit$FirstArg,
  QRL,
  ResourceReturn,
  Signal,
  useContext,
  useResource$,
  ValueOrPromise,
} from '@builder.io/qwik';
import { isBrowser } from '@builder.io/qwik/build';
import { RouteStateContext } from './contexts';
import type { Cookie, PathParams, RequestContext } from './types';

export interface ServerAction<T extends any[], B> {
  (...body: T): Promise<B>;
}

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
export declare interface SectionLoaderEvent<PLATFORM = unknown> {
  request: RequestContext;
  url: URL;
  params: PathParams;
  query: URLSearchParams;
  platform: PLATFORM;
  cookie: Cookie;
}

export class ServerLoader<RETURN> {
  constructor(public qrl: QRL<(event: SectionLoaderEvent) => ValueOrPromise<RETURN>>) {}
  use(): ResourceReturn<RETURN> {
    const state = useContext(RouteStateContext);
    const hash = this.qrl.getHash();
    return useResource$<RETURN>(({ track }) => {
      track(state);
      return state.value[hash] as RETURN;
    });
  }
}

export const serverLoaderQrl = <PLATFORM, B>(
  loaderQrl: QRL<(event: SectionLoaderEvent<PLATFORM>) => ValueOrPromise<B>>
) => {
  const hash = loaderQrl.getHash();
  return {
    qrl: loaderQrl,
    use() {
      const state = useContext(RouteStateContext);
      return useResource$(({ track }) => {
        track(state);
        return state.value[hash];
      });
    },
  };
};

export const serverLoader$ = implicit$FirstArg(serverLoaderQrl);
