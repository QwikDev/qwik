import { component$, Host, Slot, QwikIntrinsicElements } from '@builder.io/qwik';
import { getClientNavPath } from './client-navigation';
import { useLocation, useNavigate } from './use-functions';

/**
 * @public
 */
export const Link = component$<LinkProps>(
  (props) => {
    const nav = useNavigate();
    const loc = useLocation();
    const linkProps = { ...props };
    const clientNavPath = getClientNavPath(linkProps, loc);
    if (clientNavPath) {
      linkProps['preventdefault:click'] = true;
      linkProps.href = clientNavPath;
    }
    return (
      <Host
        {...linkProps}
        onClick$={() => {
          if (clientNavPath) {
            nav.path = linkProps.href!;
          }
        }}
      >
        <Slot />
      </Host>
    );
  },
  { tagName: 'a' }
);

type AnchorAttributes = QwikIntrinsicElements['a'];

/**
 * @public
 */
export interface LinkProps extends AnchorAttributes {}
