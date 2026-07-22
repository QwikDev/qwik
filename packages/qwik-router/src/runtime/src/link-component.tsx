import {
  $,
  component$,
  Slot,
  sync$,
  untrack,
  useContext,
  type QwikIntrinsicElements,
} from '@qwik.dev/core';
import { RouteStateContext } from './contexts';
import { prefetchRoute } from './prefetch-route';
import { useDocumentHead, useLocation, useNavigate } from './use-functions';
import { getClientNavPath, shouldPreload } from './utils';

/** @public */
export const Link = component$<LinkProps>((props) => {
  const nav = useNavigate();
  const loc = useLocation();
  const head = useDocumentHead();
  const loaderState = useContext(RouteStateContext);
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

  const shouldPrefetchData =
    !!clientNavPath && prefetchDataProp !== 'off' && shouldPrefetch && !isDepratedPrefetchDisabled;

  const handleDataPrefetch = shouldPrefetchData
    ? $((_: any, elm: HTMLAnchorElement) => {
        if ((navigator as any).connection?.saveData) {
          return;
        }

        if (elm && elm.href) {
          const url = new URL(elm.href);
          prefetchRoute(url, true, 0.8, head.manifestHash, false, loaderState);
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
    prefetchRoute(url, false, 1);
  });

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
   * Defaults to **`"visible"`**.
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
