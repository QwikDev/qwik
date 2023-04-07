import {
  component$,
  jsx,
  type JSXNode,
  SkipRender,
  useContext,
  useOnDocument,
  _IMMUTABLE,
  _jsxBranch,
  event$,
  useTask$,
  useSignal,
} from '@builder.io/qwik';
import type { ClientHistoryWindow } from './client-navigate';
import { ContentInternalContext } from './contexts';
import { isSameOriginDifferentPathname } from './utils';
import { useLocation } from './use-functions';
import { isBrowser } from '@builder.io/qwik/build';

/**
 * @public
 */
export interface RouterOutletProps {
  enableViewTransition?: boolean;
}

/**
 * @public
 */
export const RouterOutlet = component$<RouterOutletProps>((props) => {
  _jsxBranch();

  useOnDocument(
    'qinit',
    event$(() => {
      const POPSTATE_FALLBACK_INITIALIZED = '_qCityPopstateFallback';
      const CLIENT_HISTORY_INITIALIZED = '_qCityHistory';

      if (!(window as ClientHistoryWindow)[POPSTATE_FALLBACK_INITIALIZED]) {
        (window as ClientHistoryWindow)[POPSTATE_FALLBACK_INITIALIZED] = () => {
          if (!(window as ClientHistoryWindow)[CLIENT_HISTORY_INITIALIZED]) {
            // possible for page reload then hit back button to
            // navigate to a client route added with history.pushState()
            // in this scenario we need to reload the page
            location.reload();
          }
        };

        setTimeout(() => {
          // this popstate listener will be removed when the client history is initialized
          addEventListener(
            'popstate',
            (window as ClientHistoryWindow)[POPSTATE_FALLBACK_INITIALIZED]!
          );
        }, 0);
      }
    })
  );

  const loc = useLocation();
  const oldLocation = useSignal(loc.url);

  useTask$(({ track }) => {
    const newLocation = track(() => loc.url);

    // mark next DOM render to use startViewTransition API
    if (
      isBrowser &&
      props.enableViewTransition &&
      isSameOriginDifferentPathname(newLocation, oldLocation.value)
    ) {
      document.__q_view_transition__ = true;
    }

    oldLocation.value = newLocation;
  });

  const { value } = useContext(ContentInternalContext);
  if (value && value.length > 0) {
    const contentsLen = value.length;
    let cmp: JSXNode | null = null;
    for (let i = contentsLen - 1; i >= 0; i--) {
      cmp = jsx(value[i].default, {
        children: cmp,
      });
    }
    return cmp;
  }
  return SkipRender;
});
