import { component$, Host, Slot } from '@builder.io/qwik';
import { useNavigate } from './use-functions';

export interface LinkProps {
  href?: string;
}

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
        href={props.href}
        onClick$={() => {
          if (props.href) {
            nav.path = props.href;
          }
        }}
      >
        <Slot></Slot>
      </A>
    );
  },
  { tagName: 'a' }
);
