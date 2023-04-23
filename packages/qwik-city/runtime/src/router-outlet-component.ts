import {
  component$,
  jsx,
  type JSXNode,
  useContext,
  _IMMUTABLE,
  _jsxBranch,
  type PropFunction,
  useSignal,
  useOnWindow,
  event$,
  useVisibleTask$,
  jsxs,
  Fragment,
  noSerialize,
  type NoSerialize,
} from '@builder.io/qwik';
import { ContentInternalContext, RouteInternalContext } from './contexts';
import type { RestoreScroll } from './types';
import { toLastPositionOnPopState } from './scroll-restoration';
import { useLocation, useNavigate } from './use-functions';

/**
 * @public
 */
export interface RouterOutletProps {
  restoreScroll$?: PropFunction<RestoreScroll>;
}

/**
 * @public
 */
export const RouterOutlet = component$<RouterOutletProps>(
  ({ restoreScroll$ = toLastPositionOnPopState }) => {
    _jsxBranch();

    const routeInternal = useContext(RouteInternalContext);
    const routeLocation = useLocation();
    const navigate = useNavigate();
    const settle = useSignal<NoSerialize<(toUrl: URL) => void>>();

    useOnWindow(
      'popstate',
      event$(() => {
        navigate(location.href, { type: 'popstate' });
      })
    );

    useVisibleTask$(
      ({ track }) => {
        const [isNavigating, url] = track(() => [routeLocation.isNavigating, routeLocation.url]);
        if (isNavigating) {
          // start scroll restoration with pending url settlement
          const settled = new Promise<URL>((resolve) => (settle.value = noSerialize(resolve)));
          restoreScroll$(routeInternal.value.type, url, settled);
        } else {
          const resolve = settle.value;
          if (resolve) {
            // resolve settled url to unblock scroll restoration
            requestAnimationFrame(() => {
              resolve(url);
              settle.value = undefined;
            });
          }
        }
      },
      { strategy: 'document-ready' }
    );

    const { value } = useContext(ContentInternalContext);

    let contentCmp: JSXNode | null = null;
    if (value && value.length > 0) {
      for (let i = value.length - 1; i >= 0; i--) {
        contentCmp = jsx(value[i].default, { children: contentCmp });
      }
    }

    return jsxs(Fragment, { children: [contentCmp, hostElement] });
  }
);

const hostElement = jsx('script', {});
