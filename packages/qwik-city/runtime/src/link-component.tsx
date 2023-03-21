import { component$, Slot, type QwikIntrinsicElements, untrack } from '@builder.io/qwik';
import { getClientNavPath, getPrefetchDataset } from './utils';
import { loadClientData } from './use-endpoint';
import { useLocation, useNavigate } from './use-functions';
import { event$ } from '../../../qwik/src/core';

/**
 * @alpha
 */
export const Link = component$<LinkProps>((props) => {
  const nav = useNavigate();
  const loc = useLocation();
  const originalHref = props.href;
  const linkProps = { ...props };
  const clientNavPath = untrack(() => getClientNavPath(linkProps, loc));
  const prefetchDataset = untrack(() => getPrefetchDataset(props, clientNavPath, loc));
  const reload = !!linkProps.reload;
  linkProps['preventdefault:click'] = !!clientNavPath;
  linkProps.href = clientNavPath || originalHref;
  const event = event$((ev: any, elm: HTMLAnchorElement) =>
    prefetchLinkResources(elm as HTMLAnchorElement, ev.type === 'qvisible')
  );
  return (
    <a
      {...linkProps}
      onClick$={(_, elm) => {
        if (elm.href) {
          nav(elm.href, reload);
        }
      }}
      data-prefetch={prefetchDataset}
      onMouseOver$={event}
      onFocus$={event}
      onQVisible$={event}
    >
      <Slot />
    </a>
  );
});

/**
 * Client-side only
 */
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

/**
 * @alpha
 */
export interface LinkProps extends AnchorAttributes {
  prefetch?: boolean;
  reload?: boolean;
}
