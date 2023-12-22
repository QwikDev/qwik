import type { QwikIntrinsicElements } from '@builder.io/qwik';
import { Slot, component$ } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';

type NavLinkProps = QwikIntrinsicElements['a'] & {
  activeClass?: string;
  pendingClass?: string;
};

export const NavLink = component$(
  ({ activeClass, pendingClass, ...props }: NavLinkProps) => {
    const location = useLocation();
    const toPathname = props.href ?? '';
    const locationPathname = location.url.pathname;

    const endSlashPosition =
      toPathname !== '/' && toPathname.endsWith('/')
        ? toPathname.length - 1
        : toPathname.length;
    const check_isActive =
      locationPathname === toPathname ||
      (locationPathname.endsWith(toPathname) &&
        locationPathname.charAt(endSlashPosition) === '/');
    const check_isPendding = location.isNavigating;

    return (
      <a
        class={`
          ${props.class}  
          ${check_isActive ? activeClass : ''}
          ${check_isPendding && check_isActive ? pendingClass : ''}
        `}
        {...props}
      >
        <Slot />
      </a>
    );
  }
);
