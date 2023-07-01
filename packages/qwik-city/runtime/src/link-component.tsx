import { component$, Slot, type QwikIntrinsicElements, untrack, event$ } from '@builder.io/qwik';
import { getClientNavPath, getPrefetchDataset } from './utils';
import { loadClientData } from './use-endpoint';
import { useLocation, useNavigate } from './use-functions';
import { prefetchSymbols } from './client-navigate';

/**
 * @public
 */
export const Link = component$<LinkProps>((props) => {
  const nav = useNavigate();
  const loc = useLocation();
  const originalHref = props.href;
  const { onClick$, prefetch, prefetchSymbols, reload, replaceState, scroll, ...linkProps } = (() =>
    props)();
  const clientNavPath = untrack(() => getClientNavPath(linkProps, loc));
  const prefetchResources = untrack(() => prefetchSymbols !== false && !!clientNavPath);
  const prefetchDataset = untrack(() =>
    prefetch === true ? getPrefetchDataset(clientNavPath, loc) : null
  );
  linkProps['preventdefault:click'] = !!clientNavPath;
  linkProps.href = clientNavPath || originalHref;
  const onPrefetch =
    prefetchResources || prefetchDataset != null
      ? event$((ev: any, elm: HTMLAnchorElement) =>
          prefetchLinkResources(elm as HTMLAnchorElement, ev.type === 'qvisible')
        )
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
          elm.setAttribute('aria-pressed', 'true');
          await nav(elm.href, { forceReload: reload, replaceState, scroll });
          elm.removeAttribute('aria-pressed');
        }
      })
    : undefined;
  return (
    <a
      {...linkProps}
      onClick$={[onClick$, handleClick]}
      data-prefetch={prefetchDataset}
      onMouseOver$={onPrefetch}
      onFocus$={onPrefetch}
      onQVisible$={onPrefetch}
    >
      <Slot />
    </a>
  );
});

/**
 * Client-side only
 */
export const prefetchLinkResources = (elm: HTMLAnchorElement, isOnVisible?: boolean) => {
  if (elm && elm.href) {
    const url = new URL(elm.href);
    prefetchSymbols(url.pathname);

    if (elm.hasAttribute('data-prefetch')) {
      if (!windowInnerWidth) {
        windowInnerWidth = innerWidth;
      }

      if (!isOnVisible || (isOnVisible && windowInnerWidth < 520)) {
        // either this is a mouseover event, probably on desktop
        // or the link is visible, and the viewport width is less than X
        loadClientData(url, elm, { prefetchSymbols: false });
      }
    }
  }
};

let windowInnerWidth = 0;

type AnchorAttributes = QwikIntrinsicElements['a'];

/**
 * @public
 */
export interface LinkProps extends AnchorAttributes {
  /**
   * Whether Link should prefetch and cache the data (routeLoader$, onGet, etc.) for this page.
   * This occurs when the Link receives a mouseover or focus event on desktop, or when visible on mobile.
   * (defaults to false)
   */
  prefetch?: boolean;

  /**
   * Whether Link should prefetch the javascript bundles required to render this page.
   * This occurs when the Link becomes visible on the page.
   * (defaults to true)
   */
  prefetchSymbols?: boolean;

  reload?: boolean;
  replaceState?: boolean;
  scroll?: boolean;
}
