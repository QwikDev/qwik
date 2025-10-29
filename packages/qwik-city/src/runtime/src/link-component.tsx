import {
  component$,
  Slot,
  type QwikIntrinsicElements,
  $,
  sync$,
  useSignal,
  useVisibleTask$,
  untrack,
  type EventHandler,
  type QwikVisibleEvent,
} from '@builder.io/qwik';
import { getClientNavPath, shouldPreload } from './utils';
import { loadClientData } from './use-endpoint';
import { useLocation, useNavigate } from './use-functions';
import { preloadRouteBundles } from './client-navigate';
import { isDev } from '@builder.io/qwik';
// @ts-expect-error we don't have types for the preloader yet
import { p as preload } from '@builder.io/qwik/preloader';
// import { fallbackToMpaContext } from './contexts';

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
    fallbackToMpa: fallbackToMpaProp,
    ...linkProps
  } = (() => props)();

  // const defaultFallbackToMpa = useContext(fallbackToMpaContext).default;

  // const fallbackToMpa = __EXPERIMENTAL__.enableFallbackToMpa
  //   ? untrack(() => Boolean(fallbackToMpaProp ?? defaultFallbackToMpa))
  //   : undefined;

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
          preloadRouteBundles(url.pathname);

          if (elm.hasAttribute('data-prefetch')) {
            loadClientData(url, elm, {
              preloadRouteBundles: false,
              isPrefetch: true,
            });
          }
        }
      })
    : undefined;

  const preventDefault = clientNavPath
    ? sync$((event: MouseEvent) => {
        if (!(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
          event.preventDefault();
        }
      })
    : undefined;

  const handleClientSideNavigation = clientNavPath
    ? $(async (event: Event, elm: HTMLAnchorElement) => {
        if (event.defaultPrevented) {
          // If default was prevented, then it is up to us to make client side navigation.
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

  const handlePreload = $((_: any, target: HTMLAnchorElement) => {
    if (!target?.href) {
      return;
    }
    const onTooMany = (event: Event) => {
      const userEventPreloads = (event as CustomEvent).detail;
      /**
       * On chrome 3G throttling, 10kb takes ~1s to download. Bundles weight ~1kb on average, so 100
       * bundles is ~100kb which takes ~10s to download.
       *
       * This can serve to fallback to MPA when SPA navigation takes more than 10s. Or in extreme
       * cases, if a component needs more than a 100 bundles, display a spinner.
       */
      if (userEventPreloads.count >= 100) {
        location.assign(target.href);
      }
    };
    window.addEventListener('userEventPreloads', onTooMany);
    const url = new URL(target.href);
    preloadRouteBundles(url.pathname, 1);
    window.removeEventListener('userEventPreloads', onTooMany);
  });

  useVisibleTask$(({ track }) => {
    track(() => loc.url.pathname);
    // We need to trigger the onQVisible$ in the visible task for it to fire on subsequent route navigations
    const handler = linkProps.onQVisible$;
    if (handler) {
      const event = new CustomEvent('qvisible') as QwikVisibleEvent;

      if (Array.isArray(handler)) {
        (handler as any)
          .flat(10)
          .forEach((handler: EventHandler<QwikVisibleEvent, HTMLAnchorElement>) =>
            handler?.(event, anchorRef.value!)
          );
      } else {
        handler?.(event, anchorRef.value!);
      }
    }

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
      onClick$={[
        preventDefault,
        handlePreload, // needs to be in between preventDefault and onClick$ to ensure it starts asap.
        onClick$,
        handleClientSideNavigation,
      ]}
      data-prefetch={prefetchData}
      onMouseOver$={[linkProps.onMouseOver$, handlePrefetch]}
      onFocus$={[linkProps.onFocus$, handlePrefetch]}
      // We need to prevent the onQVisible$ from being called twice since it is handled in the visible task
      onQVisible$={[]}
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

  /**
   * **Defaults to _true_.**
   *
   * Whether Qwik should fallback to MPA navigation if too many bundles are queued for preloading.
   */
  fallbackToMpa?: boolean;
}
