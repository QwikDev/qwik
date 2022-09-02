import { component$, Slot, QwikIntrinsicElements } from '@builder.io/qwik';
import { getClientNavPath, toUrl } from './client-navigation';
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
  const clientPathname = getClientNavPath(linkProps, loc);
  const prefetchUrl = props.prefetch && clientPathname ? toUrl(clientPathname, loc).href : null;

  linkProps['preventdefault:click'] = !!clientPathname;
  linkProps.href = clientPathname || originalHref;

  return (
    <a
      {...linkProps}
      onClick$={() => {
        if (clientPathname) {
          nav.path = linkProps.href!;
        }
      }}
      onMouseOver$={() => prefetchLinkResources(prefetchUrl, false)}
      onQVisible$={() => prefetchLinkResources(prefetchUrl, true)}
    >
      <Slot />
    </a>
  );
});

let windowInnerWidth = 0;

export const prefetchLinkResources = (prefetchUrl: string | null, isOnVisible: boolean) => {
  if (!windowInnerWidth) {
    windowInnerWidth = window.innerWidth;
  }

  if (prefetchUrl && (!isOnVisible || (isOnVisible && windowInnerWidth < 520))) {
    // either this is a mouseover event, probably on desktop
    // or the link is visible, and the viewport width is less than X
    loadClientData(prefetchUrl);
  }
};

type AnchorAttributes = QwikIntrinsicElements['a'];

/**
 * @alpha
 */
export interface LinkProps extends AnchorAttributes {
  prefetch?: boolean;
}
