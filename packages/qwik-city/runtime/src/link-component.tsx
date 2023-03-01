import { component$, Slot, QwikIntrinsicElements } from '@builder.io/qwik';
import { getClientNavPath, getPrefetchDataset } from './utils';
import { loadClientData } from './use-endpoint';
import { useLocation, useNavigate } from './use-functions';

/**
 * @alpha
 */
export const Link = component$<LinkProps>((props) => {
  const nav = useNavigate();
  const loc = useLocation();
  const originalHref = props.href;
  const linkProps = { ...props };
  const clientNavPath = getClientNavPath(linkProps, loc);
  const prefetchDataset = getPrefetchDataset(props, clientNavPath, loc);

  linkProps['preventdefault:click'] = !!clientNavPath;
  linkProps.href = clientNavPath || originalHref;

  return (
    <a
      {...linkProps}
      onClick$={() => {
        if (clientNavPath) {
          nav(linkProps.href, linkProps.reload);
        }
      }}
      data-prefetch={prefetchDataset}
      onMouseOver$={(_, elm) => prefetchLinkResources(elm as HTMLAnchorElement)}
      onFocus$={(_, elm) => prefetchLinkResources(elm as HTMLAnchorElement)}
      onQVisible$={(_, elm) => prefetchLinkResources(elm as HTMLAnchorElement, true)}
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
