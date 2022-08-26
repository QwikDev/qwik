import { component$, Slot, QwikIntrinsicElements } from '@builder.io/qwik';
import { getClientNavPath } from './client-navigation';
import type { QrlPrefetchData } from './types';
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
      onMouseOver$={(ev) => {
        if (clientNavPath) {
          const data: QrlPrefetchData = { links: [clientNavPath] };
          dispatchEvent(new CustomEvent('qprefetch', { detail: data }));
        }
      }}
    >
      <Slot />
    </a>
  );
});

type AnchorAttributes = QwikIntrinsicElements['a'];

/**
 * @alpha
 */
export interface LinkProps extends AnchorAttributes {}
