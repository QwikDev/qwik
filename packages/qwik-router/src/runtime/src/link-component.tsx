import {
  $,
  component$,
  isDev,
  Slot,
  sync$,
  untrack,
  useSignal,
  useVisibleTask$,
  type EventHandler,
  type QwikIntrinsicElements,
  type QwikVisibleEvent,
} from '@qwik.dev/core';
import { preloadRouteBundles } from './client-navigate';
import { loadClientData } from './use-endpoint';
import { useLocation, useNavigate } from './use-functions';
import { getClientNavPath, shouldPreload } from './utils';

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
    prefetchBundle: prefetchBundleProp,
    prefetchData: prefetchDataProp,
    ...linkProps
  } = props;
  const clientNavPath = untrack(getClientNavPath, { ...linkProps, reload }, loc);
  linkProps.href = clientNavPath || originalHref;

  const isDepratedPrefetchDisabled = prefetchProp === false;

  const shouldPrefetch = untrack(shouldPreload, clientNavPath, loc);

  const shouldPrefetchBundle =
    !!clientNavPath &&
    prefetchBundleProp !== 'off' &&
    shouldPrefetch &&
    !isDepratedPrefetchDisabled;

  const shouldPrefetchData =
    !!clientNavPath && prefetchDataProp !== 'off' && shouldPrefetch && !isDepratedPrefetchDisabled;

  const handleBundlePrefetch = shouldPrefetchBundle
    ? $((_: any, elm: HTMLAnchorElement) => {
        if ((navigator as any).connection?.saveData) {
          return;
        }

        if (elm && elm.href) {
          const url = new URL(elm.href);
          preloadRouteBundles(url.pathname);
        }
      })
    : null;

  const handleDataPrefetch = shouldPrefetchData
    ? $((_: any, elm: HTMLAnchorElement) => {
        if ((navigator as any).connection?.saveData) {
          return;
        }

        if (elm && elm.href) {
          const url = new URL(elm.href);
          loadClientData(url, {
            preloadRouteBundles: false,
            isPrefetch: true,
          });
        }
      })
    : null;

  const preventDefault = clientNavPath
    ? sync$((event: MouseEvent) => {
        if (!(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
          event.preventDefault();
        }
      })
    : null;

  const prefetchData = $(async (_: any, elm: HTMLAnchorElement) => {
    handleDataPrefetch?.(null, elm);
  });

  const onEnterKeyDown = $((event: KeyboardEvent, element: HTMLAnchorElement) => {
    if (event.key === 'Enter') {
      prefetchData(null, element);
    }
  });

  const handleClientSideNavigation = clientNavPath
    ? $((event: Event, elm: HTMLAnchorElement) => {
        if (event.defaultPrevented) {
          // If default was prevented, then it is up to us to make client side navigation.
          if (elm.href) {
            elm.setAttribute('aria-pressed', 'true');
            nav(elm.href, { forceReload: reload, replaceState, scroll }).then(() => {
              elm.removeAttribute('aria-pressed');
            });
          }
        }
      })
    : null;

  const handlePreload = $((_: any, elm: HTMLAnchorElement) => {
    const url = new URL(elm.href);
    preloadRouteBundles(url.pathname, 1);
  });

  useVisibleTask$(async ({ track }) => {
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

    const isProdOrTest = !isDev || import.meta.env.TEST;

    if (isProdOrTest && anchorRef.value) {
      if (
        prefetchBundleProp === 'visible' ||
        // deprecated prop below, remove in favor of prefetchBundle
        prefetchProp === 'js' ||
        prefetchProp === true
      ) {
        handleBundlePrefetch?.(null, anchorRef.value);
      }
      if (
        prefetchDataProp === 'visible' ||
        // deprecated prop below, remove in favor of prefetchData
        prefetchProp === true
      ) {
        handleDataPrefetch?.(null, anchorRef.value);
      }
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
      onPointerEnter$={[
        linkProps.onMouseOver$,
        prefetchDataProp === 'intent' ? prefetchData : null,
      ]}
      onFocus$={[linkProps.onFocus$, prefetchDataProp === 'intent' ? prefetchData : null]}
      onPointerDown$={[
        linkProps.onPointerDown$,
        prefetchDataProp === 'commit' ? prefetchData : null,
      ]}
      onKeyDown$={[linkProps.onKeyDown$, prefetchDataProp === 'commit' ? onEnterKeyDown : null]}
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
   * This only changes when route data is fetched. It does not change how Qwik preloads the
   * javascript needed for the next page.
   *
   * Route data prefetching occurs based on the active prefetch strategy.
   *
   * By default, fine pointers use **`hover`** and coarse pointers use **`viewport`**. Use
   * **`prefetchDataStrategy`** to customize this per link, or the router's **`linkDataPrefetch`**
   * option to change the app-wide defaults.
   *
   * Prefetching will not occur if the user has the **data saver** setting enabled.
   *
   * Setting this value to **`"js"`** will prefetch only javascript bundles required to render this
   * page on the client, **`false`** will disable prefetching altogether.
   *
   * @deprecated Use `prefetchBundle` and `prefetchData` instead for more granular control over what
   *   is prefetched and when. This prop will be removed in a future major version.
   */
  prefetch?: boolean | 'js';

  prefetchBundle?: PrefetchStrategy;
  prefetchData?: PrefetchStrategy;
  reload?: boolean;
  replaceState?: boolean;
  scroll?: boolean;
}

/**
 * Defines when link prefetching should be triggered.
 *
 * @public
 */
export type PrefetchStrategy =
  /**
   * Prefetch when the user commits to navigating.
   *
   * Triggered by `pointerdown` or the `Enter` key.
   */
  | 'commit'
  /**
   * Prefetch when the user shows navigation intent.
   *
   * Triggered by `pointerenter`, hover, or focus.
   */
  | 'intent'
  /** Prefetch when the link becomes visible in the viewport. */
  | 'visible'
  /** Disable link prefetching. */
  | 'off';
