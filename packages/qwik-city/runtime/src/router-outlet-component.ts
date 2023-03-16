import {
  component$,
  implicit$FirstArg,
  jsx,
  JSXNode,
  QRL,
  SkipRender,
  useContext,
  useOnDocument,
  _IMMUTABLE,
  _jsxBranch,
} from '@builder.io/qwik';
import type { ClientHistoryWindow } from './client-navigate';
import { ContentInternalContext } from './contexts';

export const clientQrl = <T>(qrl: QRL<T>): QRL<T> => {
  return qrl;
};

export const client$ = implicit$FirstArg(clientQrl);

/**
 * @alpha
 */
export const RouterOutlet = component$(() => {
  _jsxBranch();

  useOnDocument(
    'qinit',
    client$(() => {
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

/**
 * @deprecated Please use `RouterOutlet` instead.
 * @alpha
 */
export const Content = RouterOutlet;
