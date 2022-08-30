import { component$, Slot, QwikIntrinsicElements } from '@builder.io/qwik';
import { getClientNavPath } from './client-navigation';
import type { QPrefetchData } from './service-worker/types';
import { fetchClientData } from './use-endpoint';
import { useLocation, useNavigate } from './use-functions';

/**
 * @alpha
 */
export const Link = component$<LinkProps>((props) => {
  const nav = useNavigate();
  const loc = useLocation();
  const linkProps = { ...props };
  const clientNavPath = getClientNavPath(linkProps, loc);
  if (clientNavPath) {
    linkProps['preventdefault:click'] = true;
    linkProps.href = clientNavPath;
  }
  return (
    <a
      {...linkProps}
      onClick$={() => {
        if (clientNavPath) {
          nav.path = linkProps.href!;
        }
      }}
      onMouseOver$={() => prefetchLinkResources(clientNavPath, loc, false)}
      onQVisible$={() => prefetchLinkResources(clientNavPath, loc, true)}
    >
      <Slot />
    </a>
  );
});

let windowInnerWidth = 0;

export const prefetchLinkResources = (
  clientNavPath: string | null,
  baseUrl: { href: string },
  isOnVisible: boolean
) => {
  if (!windowInnerWidth) {
    windowInnerWidth = window.innerWidth;
  }

  if (clientNavPath && (!isOnVisible || (isOnVisible && windowInnerWidth < 800))) {
    // either this is a mouseover event, probably on desktop
    // or the link is visible, and the viewport width is less than X
    fetchClientData(clientNavPath, baseUrl);
    const data: QPrefetchData = { links: [clientNavPath] };
    dispatchEvent(new CustomEvent('qprefetch', { detail: data }));
  }
};

type AnchorAttributes = QwikIntrinsicElements['a'];

/**
 * @alpha
 */
export interface LinkProps extends AnchorAttributes {}
