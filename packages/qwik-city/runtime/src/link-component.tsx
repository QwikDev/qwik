import type { ClientHistoryWindow } from './client-navigate';
import { component$, Slot, QwikIntrinsicElements, $, useOnDocument } from '@builder.io/qwik';
import { CLIENT_HISTORY_INITIALIZED, POPSTATE_FALLBACK_INITIALIZED } from './constants';
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

  useOnDocument(
    'qinit',
    $(() => {
      if (!(window as ClientHistoryWindow)[POPSTATE_FALLBACK_INITIALIZED]) {
        (window as ClientHistoryWindow)[POPSTATE_FALLBACK_INITIALIZED] = () => {
          if (!(window as ClientHistoryWindow)[CLIENT_HISTORY_INITIALIZED]) {
            // possible for page reload then hit back button to
            // navigate to a client route added with history.pushState()
            // in this scenario we need to reload the page
            location.reload();
          }
        };

        setTimeout(() => {
          // this popstate listener will be removed when the client history is initialized
          addEventListener(
            'popstate',
            (window as ClientHistoryWindow)[POPSTATE_FALLBACK_INITIALIZED]!
          );
        }, 0);
      }
    })
  );

  return (
    <a
      {...linkProps}
      onClick$={() => {
        if (clientNavPath) {
          nav.path = linkProps.href as any;
        }
      }}
      data-prefetch={prefetchDataset}
      onMouseOver$={(_, elm) => prefetchLinkResources(elm as HTMLAnchorElement)}
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
      loadClientData(elm.href);
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
