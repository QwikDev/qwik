import {
  component$,
  Slot,
  type QwikIntrinsicElements,
  $,
  sync$,
  useSignal,
  useVisibleTask$,
  untrack,
} from '@builder.io/qwik';
import { getClientNavPath, shouldPreload } from './utils';
import { loadClientData } from './use-endpoint';
import { useLocation, useNavigate } from './use-functions';
import { prefetchSymbols } from './client-navigate';
import { isDev } from '@builder.io/qwik';

/** @public */
export const Link = component$<LinkProps>((props) => {
  const nav = useNavigate();
  const loc = useLocation();
  const originalHref = props.href;
  const anchorRef = useSignal<HTMLAnchorElement>();
  const {
    onClick$,
    prefetch: prefetchProp,
    reload,
    replaceState,
    scroll,
    ...linkProps
  } = (() => props)();
  const clientNavPath = untrack(() => getClientNavPath({ ...linkProps, reload }, loc));
  linkProps.href = clientNavPath || originalHref;

  const prefetchData = untrack(
    () => (!!clientNavPath && prefetchProp !== false && prefetchProp !== 'js') || undefined
  );

  const prefetch = untrack(
    () =>
      prefetchData ||
      (!!clientNavPath && prefetchProp !== false && shouldPreload(clientNavPath, loc))
  );

  const handlePrefetch = prefetch
    ? $((_: any, elm: HTMLAnchorElement) => {
        if ((navigator as any).connection?.saveData) {
          return;
        }

        if (elm && elm.href) {
          const url = new URL(elm.href);
          prefetchSymbols(url.pathname);

          if (elm.hasAttribute('data-prefetch')) {
            loadClientData(url, elm, {
              prefetchSymbols: false,
              isPrefetch: true,
            });
          }
        }
      })
    : undefined;
  const preventDefault = clientNavPath
    ? sync$((event: MouseEvent, target: HTMLAnchorElement) => {
        if (!(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
          event.preventDefault();
        }
      })
    : undefined;
  const handleClick = clientNavPath
    ? $(async (event: Event, elm: HTMLAnchorElement) => {
        if (event.defaultPrevented) {
          // If default was prevented, than it is up to us to make client side navigation.
          if (elm.hasAttribute('q:nbs')) {
            // Allow bootstrapping into useNavigate.
            await nav(location.href, { type: 'popstate' });
          } else if (elm.href) {
            elm.setAttribute('aria-pressed', 'true');
            await nav(elm.href, { forceReload: reload, replaceState, scroll });
            elm.removeAttribute('aria-pressed');
          }
        }
      })
    : undefined;

  useVisibleTask$(({ track }) => {
    track(() => loc.url.pathname);
    // Don't prefetch on visible in dev mode
    if (!isDev && anchorRef.value) {
      handlePrefetch?.(undefined, anchorRef.value!);
    }
  });

  return (
    <a
      ref={anchorRef}
      // Attr 'q:link' is used as a selector for bootstrapping into spa after context loss
      {...{ 'q:link': !!clientNavPath }}
      {...linkProps}
      onClick$={[preventDefault, onClick$, handleClick]}
      data-prefetch={prefetchData}
      onMouseOver$={[linkProps.onMouseOver$, handlePrefetch]}
      onFocus$={[linkProps.onFocus$, handlePrefetch]}
    >
      <Slot />
    </a>
  );
});

type AnchorAttributes = QwikIntrinsicElements['a'];

/** @public */
export interface LinkProps extends AnchorAttributes {
  /**
   * **Defaults to _true_.**
   *
   * Whether Qwik should prefetch and cache the target page of this **`Link`**, this includes
   * invoking any **`routeLoader$`**, **`onGet`**, etc.
   *
   * This **improves UX performance** for client-side (**SPA**) navigations.
   *
   * Prefetching occurs when a the Link enters the viewport in production (**`on:qvisible`**), or
   * with **`mouseover`/`focus`** during dev.
   *
   * Prefetching will not occur if the user has the **data saver** setting enabled.
   *
   * Setting this value to **`"js"`** will prefetch only javascript bundles required to render this
   * page on the client, **`false`** will disable prefetching altogether.
   */
  prefetch?: boolean | 'js';

  reload?: boolean;
  replaceState?: boolean;
  scroll?: boolean;
}
