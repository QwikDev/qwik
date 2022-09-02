import { component$, Slot, QwikIntrinsicElements } from '@builder.io/qwik';
import { getClientNavPath } from './client-navigation';
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
  const prefetch = !!props.prefetch;

  linkProps['preventdefault:click'] = !!clientNavPath;
  linkProps.href = clientNavPath || originalHref;

  return (
    <a
      {...linkProps}
      onClick$={() => {
        if (clientNavPath) {
          nav.path = linkProps.href!;
        }
      }}
      onMouseOver$={() => prefetchLinkResources(clientNavPath, loc, prefetch, false)}
      onQVisible$={() => prefetchLinkResources(clientNavPath, loc, prefetch, true)}
    >
      <Slot />
    </a>
  );
});

let windowInnerWidth = 0;

export const prefetchLinkResources = (
  clientNavPath: string | null,
  baseUrl: { pathname: string; href: string },
  prefetch: boolean,
  isOnVisible: boolean
) => {
  if (!windowInnerWidth) {
    windowInnerWidth = window.innerWidth;
  }

  if (prefetch && clientNavPath && (!isOnVisible || (isOnVisible && windowInnerWidth < 500))) {
    // either this is a mouseover event, probably on desktop
    // or the link is visible, and the viewport width is less than X
    loadClientData(clientNavPath, baseUrl);
  }
};

type AnchorAttributes = QwikIntrinsicElements['a'];

/**
 * @alpha
 */
export interface LinkProps extends AnchorAttributes {
  prefetch?: boolean;
}
