import { component$, Slot, type QwikIntrinsicElements, untrack, event$ } from '@builder.io/qwik';
import { getClientNavPath, shouldPrefetchData, shouldPrefetchSymbols } from './utils';
import { loadClientData } from './use-endpoint';
import { useLocation, useNavigate } from './use-functions';
import { prefetchSymbols } from './client-navigate';
import { isDev } from '@builder.io/qwik/build';

/**
 * @public
 */
export const Link = component$<LinkProps>((props) => {
  const nav = useNavigate();
  const loc = useLocation();
  const originalHref = props.href;
  const {
    onClick$,
    prefetch: prefetchProp,
    reload,
    replaceState,
    scroll,
    ...linkProps
  } = (() => props)();
  const clientNavPath = untrack(() => getClientNavPath(linkProps, loc));
  linkProps['preventdefault:click'] = !!clientNavPath;
  linkProps.href = clientNavPath || originalHref;

  const prefetchData = untrack(
    () =>
      (!!clientNavPath &&
        prefetchProp !== false &&
        prefetchProp !== 'symbols' &&
        shouldPrefetchData(clientNavPath, loc)) ||
      undefined
  );

  const prefetch = untrack(
    () =>
      prefetchData ||
      (!!clientNavPath && prefetchProp !== false && shouldPrefetchSymbols(clientNavPath, loc))
  );

  const handlePrefetch = prefetch
    ? event$((_: any, elm: HTMLAnchorElement) => {
        if ((navigator as any).connection && (navigator as any).connection.saveData) {
          return;
        }

        if (elm && elm.href) {
          const url = new URL(elm.href);
          prefetchSymbols(url.pathname);

          if (elm.hasAttribute('data-prefetch')) {
            loadClientData(url, elm, { prefetchSymbols: false });
          }
        }
      })
    : undefined;

  const handleClick = clientNavPath
    ? event$(async (event: any, elm: HTMLAnchorElement) => {
        if (!(event as PointerEvent).defaultPrevented) {
          // Don't enter the nav pipeline if default hasn't been prevented.
          return;
        }

        if (elm.hasAttribute('q:nbs')) {
          // Allow bootstrapping into useNavigate.
          await nav(location.href, { type: 'popstate' });
        } else if (elm.href) {
          await nav(elm.href, { forceReload: reload, replaceState, scroll });
        }
      })
    : undefined;

  return (
    <a
      {...linkProps}
      onClick$={[onClick$, handleClick]}
      data-prefetch={prefetchData}
      onMouseOver$={isDev ? handlePrefetch : undefined}
      onFocus$={isDev ? handlePrefetch : undefined}
      onQVisible$={!isDev ? handlePrefetch : undefined}
    >
      <Slot />
    </a>
  );
});

type AnchorAttributes = QwikIntrinsicElements['a'];

/**
 * @public
 */
export interface LinkProps extends AnchorAttributes {
  /**
   * **Defaults to _true_.**
   *
   * Whether Qwik should prefetch and cache the target page of this **`Link`**,
   * this includes invoking any **`routeLoader$`**, **`onGet`**, etc.
   *
   * This **improves UX performance** for client-side (**SPA**) navigations.
   *
   * Prefetching occurs when a the Link enters the viewport in production (**`on:qvisibile`**),
   * or with **`mouseover`** during development.
   *
   * Prefetching will not occur if the user has the **data saver** setting enabled.
   *
   * Setting this value to **`"symbols"`** will only prefetch javascript bundles
   * required to render this page on the client.
   */
  prefetch?: boolean | 'symbols';

  reload?: boolean;
  replaceState?: boolean;
  scroll?: boolean;
}
