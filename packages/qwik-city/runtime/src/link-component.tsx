import {
  component$,
  Slot,
  type QwikIntrinsicElements,
  untrack,
  event$,
  sync$,
} from '@builder.io/qwik';
import { getClientNavPath, getPrefetchDataset } from './utils';
import { loadClientData } from './use-endpoint';
import { useLocation, useNavigate } from './use-functions';

/** @public */
export const Link = component$<LinkProps>((props) => {
  const nav = useNavigate();
  const loc = useLocation();
  const originalHref = props.href;
  const { onClick$, reload, replaceState, scroll, ...linkProps } = (() => props)();
  const clientNavPath = untrack(() => getClientNavPath({ ...linkProps, reload }, loc));
  const prefetchDataset = untrack(() => getPrefetchDataset(props, clientNavPath, loc));
  linkProps['link:app'] = !!clientNavPath;
  linkProps.href = clientNavPath || originalHref;
  const onPrefetch =
    prefetchDataset != null
      ? event$((ev: any, elm: HTMLAnchorElement) =>
          prefetchLinkResources(elm as HTMLAnchorElement, ev.type === 'qvisible')
        )
      : undefined;
  const preventDefault = sync$((event: MouseEvent, target: HTMLAnchorElement) => {
    if (
      target.hasAttribute('link:app') &&
      !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    ) {
      event.preventDefault();
    }
  });
  const handleClick = event$(async (event: Event, elm: HTMLAnchorElement) => {
    if (event.defaultPrevented) {
      // If default was prevented, than it is upto us to make client side navigation.
      if (elm.hasAttribute('q:nbs')) {
        // Allow bootstrapping into useNavigate.
        await nav(location.href, { type: 'popstate' });
      } else if (elm.href) {
        elm.setAttribute('aria-pressed', 'true');
        await nav(elm.href, { forceReload: reload, replaceState, scroll });
        elm.removeAttribute('aria-pressed');
      }
    }
  });
  return (
    <a
      {...linkProps}
      onClick$={[preventDefault, onClick$, handleClick]}
      data-prefetch={prefetchDataset}
      onMouseOver$={onPrefetch}
      onFocus$={onPrefetch}
      onQVisible$={onPrefetch}
    >
      <Slot />
    </a>
  );
});

/** Client-side only */
export const prefetchLinkResources = (elm: HTMLAnchorElement, isOnVisible?: boolean) => {
  if (elm && elm.href && elm.hasAttribute('data-prefetch')) {
    if (!windowInnerWidth) {
      windowInnerWidth = innerWidth;
    }

    if (!isOnVisible || (isOnVisible && windowInnerWidth < 520)) {
      // either this is a mouseover event, probably on desktop
      // or the link is visible, and the viewport width is less than X
      loadClientData(new URL(elm.href), elm);
    }
  }
};

let windowInnerWidth = 0;

type AnchorAttributes = QwikIntrinsicElements['a'];

/** @public */
export interface LinkProps extends AnchorAttributes {
  prefetch?: boolean;
  reload?: boolean;
  replaceState?: boolean;
  scroll?: boolean;
  /// Is this a link to the current app?
  /// If so than we need to prevent:default (but only if no modifier keys are pressed)
  'link:app'?: boolean;
}
