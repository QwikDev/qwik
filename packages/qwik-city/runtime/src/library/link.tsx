import { component$, Host, HTMLAttributes, Slot } from '@builder.io/qwik';
import { getClientNavigatePath } from './client-history';
import { useNavigate } from './use-functions';

/**
 * @public
 */
export const Link = component$(
  (props: LinkProps) => {
    const nav = useNavigate();
    const A = Host as any;
    return (
      <A
        preventdefault:click
        onClick$={() => {
          const clientPath = getClientNavigatePath(props.href);
          if (clientPath) {
            nav.path = clientPath;
          }
        }}
        {...props}
      >
        <Slot />
      </A>
    );
  },
  { tagName: 'a' }
);

/**
 * @public
 */
export interface LinkProps extends HTMLAttributes<HTMLAnchorElement> {
  href?: string;
}
