import {
  $,
  component$,
  getPlatform,
  isDev,
  isServer,
  Slot,
  sync$,
  untrack,
  useComputed$,
  useSignal,
  useVisibleTask$,
  type EventHandler,
  type QwikIntrinsicElements,
  type QwikVisibleEvent,
} from '@qwik.dev/core';
import { preloadRouteBundles } from './client-navigate';
import { DEFAULT_LINK_DATA_PREFETCH_STRATEGY } from './link-prefetch-strategy';
import { loadClientData } from './use-endpoint';
import { useLocation, useNavigate } from './use-functions';
import { getClientNavPath, shouldPreload } from './utils';
import type {
  LinkDataCoarsePrefetchStrategy,
  LinkDataFinePrefetchStrategy,
  LinkDataPrefetchOptions,
} from './types';

// Store the entire object first so Vite's define can replace it
const globalPrefetchStrategy =
  globalThis.__LINK_DATA_PREFETCH_STRATEGY__ || DEFAULT_LINK_DATA_PREFETCH_STRATEGY;

const coarsePointerGlobalPrefetchOptions = globalPrefetchStrategy.coarsePointer!;
const finePointerGlobalPrefetchOptions = globalPrefetchStrategy.finePointer!;

export function getLinkDataPrefetchStrategy(
  isCoarsePointer: boolean,
  prefetchDataStrategy?: LinkDataPrefetchOptions
): LinkDataCoarsePrefetchStrategy[] | LinkDataFinePrefetchStrategy[] {
  if (isCoarsePointer) {
    return prefetchDataStrategy?.coarsePointer || coarsePointerGlobalPrefetchOptions;
  } else {
    return prefetchDataStrategy?.finePointer || finePointerGlobalPrefetchOptions;
  }
}

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
    prefetchDataStrategy,
    ...linkProps
  } = props;
  const clientNavPath = untrack(getClientNavPath, { ...linkProps, reload }, loc);
  linkProps.href = clientNavPath || originalHref;

  const shouldPrefetch = !!clientNavPath && prefetchProp !== false;
  const prefetchData = (shouldPrefetch && prefetchProp !== 'js') || undefined;
  const prefetch = prefetchData || (shouldPrefetch && untrack(shouldPreload, clientNavPath, loc));

  const handleBundlePrefetch = prefetch
    ? $((_: any, elm: HTMLAnchorElement) => {
        if ((navigator as any).connection?.saveData) {
          return;
        }

        if (elm && elm.href) {
          const url = new URL(elm.href);
          preloadRouteBundles(url.pathname);
        }
      })
    : undefined;

  const handleDataPrefetch = prefetchData
    ? $((_: any, elm: HTMLAnchorElement) => {
        if ((navigator as any).connection?.saveData) {
          return;
        }

        if (elm && elm.href && elm.hasAttribute('data-prefetch')) {
          const url = new URL(elm.href);
          loadClientData(url, {
            preloadRouteBundles: false,
            isPrefetch: true,
          });
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
    : undefined;

  const handlePreload = $((_: any, elm: HTMLAnchorElement) => {
    const url = new URL(elm.href);
    preloadRouteBundles(url.pathname, 1);
  });

  const prefetchStrategies = useComputed$(() => {
    const isOnServer = import.meta.env.TEST ? getPlatform().isServer : isServer;
    if (isOnServer) {
      return [];
    }
    return getLinkDataPrefetchStrategy(
      window.matchMedia('(pointer: coarse)').matches,
      prefetchDataStrategy
    );
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

    // Bundle preloading still happens automatically. The strategy only controls route data
    // prefetching performed via `loadClientData()`.
    if (isProdOrTest && anchorRef.value) {
      handleBundlePrefetch?.(undefined, anchorRef.value);
    }

    const prefetchOptions = prefetchStrategies.value;
    if (isProdOrTest && prefetchOptions.includes('viewport') && anchorRef.value) {
      handleDataPrefetch?.(undefined, anchorRef.value);
    }
  });

  const prefetchHoverData = $(async (_: any, elm: HTMLAnchorElement) => {
    const prefetchOptions = prefetchStrategies.value;
    // TODO: hover doesnt exist on touch devices
    if (prefetchOptions.includes('hover' as any)) {
      handleDataPrefetch?.(undefined, elm);
    }
  });

  const prefetchFocusData = $(async (_: any, elm: HTMLAnchorElement) => {
    const prefetchOptions = prefetchStrategies.value;
    if (prefetchOptions.includes('focus')) {
      handleDataPrefetch?.(undefined, elm);
    }
  });

  const prefetchPointerDownData = $(async (_: any, elm: HTMLAnchorElement) => {
    const prefetchOptions = prefetchStrategies.value;
    if (prefetchOptions.includes('pointerdown')) {
      handleDataPrefetch?.(undefined, elm);
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
      onMouseOver$={[linkProps.onMouseOver$, prefetchHoverData]}
      onFocus$={[linkProps.onFocus$, prefetchFocusData]}
      onPointerDown$={[linkProps.onPointerDown$, prefetchPointerDownData]}
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
   */
  prefetch?: boolean | 'js';
  /**
   * Specifies when route data should be prefetched to improve navigation performance.
   *
   * Defaults to `{ coarsePointer: ['viewport'], finePointer: ['hover'] }`.
   */
  prefetchDataStrategy?: LinkDataPrefetchOptions;

  reload?: boolean;
  replaceState?: boolean;
  scroll?: boolean;
}
