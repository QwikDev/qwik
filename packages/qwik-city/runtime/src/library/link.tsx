import { component$, Host, Slot, QwikIntrinsicElements } from '@builder.io/qwik';
import { getClientNavigatePath } from './client-history';
import { useNavigate } from './use-functions';

/**
 * @public
 */
export const Link = component$<LinkProps>(
  (props) => {
    const nav = useNavigate();
    return (
      <Host
        preventdefault:click
        onClick$={() => {
          const clientPath = getClientNavigatePath(props.href, location);
          if (clientPath) {
            nav.path = clientPath;
          }
        }}
        {...props}
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
