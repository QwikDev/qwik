import { component$, Slot, QwikIntrinsicElements } from '@builder.io/qwik';
import { getClientNavPath, getPrefetchUrl } from './utils';
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
  const prefetchUrl = getPrefetchUrl(props, clientNavPath, loc);

  linkProps['preventdefault:click'] = !!clientNavPath;
  linkProps.href = clientNavPath || originalHref;

  return (
    <a
      {...linkProps}
      onClick$={() => {
        if (clientNavPath) {
          nav.path = linkProps.href as any;
        }
      }}
      data-prefetch={prefetchUrl}
      onMouseOver$={(_, elm) => prefetchLinkResources(elm as HTMLElement)}
      onQVisible$={(_, elm) => prefetchLinkResources(elm as HTMLElement, true)}
    >
      <Slot />
    </a>
  );
});

export const prefetchLinkResources = (elm: HTMLElement, isOnVisible?: boolean) => {
  const prefetchUrl = elm?.dataset?.prefetch;
  if (prefetchUrl) {
    if (!windowInnerWidth) {
      windowInnerWidth = window.innerWidth;
    }

    if (!isOnVisible || (isOnVisible && windowInnerWidth < 520)) {
      // either this is a mouseover event, probably on desktop
      // or the link is visible, and the viewport width is less than X
      loadClientData(prefetchUrl);
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
}
