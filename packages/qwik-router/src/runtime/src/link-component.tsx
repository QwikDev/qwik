import {
  $,
  component$,
  isServer,
  Slot,
  sync$,
  untrack,
  type QwikIntrinsicElements,
} from '@qwik.dev/core';
import { _modulepreload } from '@qwik.dev/core/internal';
import { preloadRouteBundles } from './client-navigate';
import { ROUTER_CONFIG_BUNDLE_GRAPH_NAME } from './constants';
import { prefetchRoute } from './prefetch-route';
import { findRouterConfig } from './router-config';
import { getLayoutKeys, getNewLayoutKeys, matchRouteTree } from './routing';
import { useDocumentHead, useLocation, useNavigate } from './use-functions';
import { getClientNavPath, shouldPreload } from './utils';

const INTENT_PRIORITY = 0.9;

/** @public */
export const Link = component$<LinkProps>((props) => {
  const nav = useNavigate();
  const loc = useLocation();
  const head = useDocumentHead();
  const originalHref = props.href;
  const {
    onClick$,
    prefetch: prefetchProp,
    reload,
    replaceState,
    scroll,
    prefetchBundles: prefetchBundlesProp = 'visible',
    prefetchData: prefetchDataProp = prefetchProp === 'js' ? 'off' : 'intent',
    ...linkProps
  } = props;
  const clientNavPath = untrack(getClientNavPath, { ...linkProps, reload }, loc);
  linkProps.href = clientNavPath || originalHref;

  const isDepratedPrefetchDisabled = prefetchProp === false;

  const shouldPrefetch = untrack(shouldPreload, clientNavPath, loc);

  const shouldVisiblePrefetchBundles =
    !!clientNavPath &&
    shouldPrefetch &&
    !isDepratedPrefetchDisabled &&
    (prefetchBundlesProp === 'visible' ||
      // deprecated prop below, remove in favor of prefetchBundles
      prefetchProp === 'js' ||
      prefetchProp === true);

  const shouldVisiblePrefetchData =
    !!clientNavPath &&
    shouldPrefetch &&
    !isDepratedPrefetchDisabled &&
    (prefetchDataProp === 'visible' ||
      // deprecated prop below, remove in favor of prefetchData
      prefetchProp === true);

  // The bundle graph is keyed by route name (`product/[id]/`), which needs the route tree
  const routes = !!clientNavPath && findRouterConfig()?.routes;
  const route =
    routes &&
    untrack(() => {
      try {
        return matchRouteTree(routes, new URL(clientNavPath!, loc.url).pathname);
      } catch {
        return undefined;
      }
    });
  const newLayoutKeys =
    shouldVisiblePrefetchBundles && routes && route && !route.notFound
      ? untrack(() =>
          getNewLayoutKeys(
            getLayoutKeys(matchRouteTree(routes, loc.url.pathname).loaders),
            getLayoutKeys(route.loaders)
          )
        )
      : undefined;

  const shouldPrefetchBundles =
    !!clientNavPath &&
    prefetchBundlesProp !== 'off' &&
    shouldPrefetch &&
    !isDepratedPrefetchDisabled;

  const shouldPrefetchData =
    !!clientNavPath && prefetchDataProp !== 'off' && shouldPrefetch && !isDepratedPrefetchDisabled;

  const handleBundlePrefetch = shouldPrefetchBundles
    ? $((_: any, elm: HTMLAnchorElement) => {
        if ((navigator as any).connection?.saveData) {
          return;
        }

        if (elm && elm.href) {
          const url = new URL(elm.href);
          prefetchRoute(url, false, INTENT_PRIORITY);
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
          prefetchRoute(url, true, 0.8, head.manifestHash, false);
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
    if (event.key !== 'Enter') {
      return;
    }
    if (prefetchDataProp === 'commit') {
      prefetchData(null, element);
    }
    if (prefetchBundlesProp === 'commit') {
      handleBundlePrefetch?.(null, element);
    }
  });

  const handleClientSideNavigation = clientNavPath
    ? $((event: Event, elm: HTMLAnchorElement) => {
        if (event.defaultPrevented) {
          // If default was prevented, then it is up to us to make client side navigation.
          if (elm.href) {
            elm.setAttribute('data-navigating', '');
            nav(elm.href, { forceReload: reload, replaceState, scroll }).finally(() => {
              elm.removeAttribute('data-navigating');
            });
          }
        }
      })
    : null;

  const handlePreload = $((_: any, elm: HTMLAnchorElement) => {
    const routeName = elm.getAttribute('data-q-route');
    if (routeName) {
      preloadRouteBundles(routeName, 1);
    }
    prefetchRoute(new URL(elm.href), false, 1);
  });

  if (isServer && clientNavPath && !reload) {
    _modulepreload(handlePreload, handleClientSideNavigation, nav, ROUTER_CONFIG_BUNDLE_GRAPH_NAME);
  }

  return (
    <a
      // Attr 'q:link' is used as a selector for bootstrapping into spa after context loss
      {...{ 'q:link': !!clientNavPath }}
      {...linkProps}
      data-q-prefetch={
        shouldVisiblePrefetchBundles && shouldVisiblePrefetchData
          ? 'bd'
          : shouldVisiblePrefetchBundles
            ? 'b'
            : shouldVisiblePrefetchData
              ? 'd'
              : null
      }
      data-q-route={route && !route.notFound ? '/' + route.routeParts.join('/') : undefined}
      data-q-layouts={newLayoutKeys?.length ? newLayoutKeys.join(' ') : undefined}
      onClick$={[
        preventDefault,
        handlePreload, // needs to be in between preventDefault and onClick$ to ensure it starts asap.
        onClick$,
        handleClientSideNavigation,
      ]}
      onPointerEnter$={[
        linkProps.onPointerEnter$,
        prefetchDataProp === 'intent' ? prefetchData : null,
        prefetchBundlesProp === 'commit' ? null : handleBundlePrefetch,
      ]}
      onFocus$={[
        linkProps.onFocus$,
        prefetchDataProp === 'intent' ? prefetchData : null,
        prefetchBundlesProp === 'commit' ? null : handleBundlePrefetch,
      ]}
      onPointerDown$={[
        linkProps.onPointerDown$,
        prefetchDataProp === 'commit' ? prefetchData : null,
        prefetchBundlesProp === 'commit' ? handleBundlePrefetch : null,
      ]}
      onKeyDown$={[
        linkProps.onKeyDown$,
        prefetchDataProp === 'commit' || prefetchBundlesProp === 'commit' ? onEnterKeyDown : null,
      ]}
    >
      <Slot />
    </a>
  );
});

type AnchorAttributes = QwikIntrinsicElements['a'];

/** @public */
export interface LinkProps extends AnchorAttributes {
  /**
   * @deprecated Use `prefetchBundles` and `prefetchData` instead for more granular control over
   *   what is prefetched and when. This prop will be removed in a future major version.
   *
   *   Legacy prefetch control for this **`Link`**.
   *
   *   Setting this value to **`"js"`** will prefetch only javascript bundles required to render this
   *   page on the client when the link becomes visible. Setting this value to **`true`** will
   *   prefetch both javascript bundles and route data when the link becomes visible. Setting this
   *   value to **`false`** will disable prefetching altogether.
   */
  prefetch?: boolean | 'js';

  /**
   * Controls when Qwik should prefetch the javascript bundles required to render this **`Link`**
   * target during client-side navigation.
   *
   * Defaults to **`"visible"`**. A link that prefetches when visible is hinted again, ahead of the
   * others, when the user hovers or focuses it.
   *
   * Prefetching will not occur if the user has the **data saver** setting enabled.
   */
  prefetchBundles?: PrefetchStrategy;

  /**
   * Controls when Qwik should prefetch and cache route data for this **`Link`** target, including
   * invoking any **`routeLoader$`**, **`onGet`**, etc.
   *
   * Defaults to **`"intent"`**. When using the deprecated **`prefetch="js"`** prop, route data
   * prefetching defaults to **`"off"`**.
   *
   * Prefetching route data can improve client-side navigation performance for pages that wait on
   * loaders, server handlers, databases, or API calls.
   *
   * Prefetching will not occur if the user has the **data saver** setting enabled.
   */
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
