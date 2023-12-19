/**
 * NavLink component.
 *
 * Extends Link component from qwik-city to add isActive and isPending props.
 * Checks if current location url matches link href to set isActive.
 * Uses isNavigating from useLocation hook to set isPending.
 * Renders Link component with additional class names based on isActive/isPending.
 */
import { Slot, component$ } from "@builder.io/qwik";
import { Link, type LinkProps, useLocation } from "@builder.io/qwik-city";


interface NavLinkProps extends LinkProps {
  isActive?: string;
  isPending?: string;
}

export const NavLink = component$(
  ({ isActive, isPending, ...props }: NavLinkProps) => {
    const location = useLocation();
    const toPathname = props.href ?? "";
    const locationPathname = location.url.pathname;

    const endSlashPosition =
      toPathname !== "/" && toPathname.endsWith("/")
        ? toPathname.length - 1
        : toPathname.length;
    const check_isActive =
      locationPathname === toPathname ||
      (locationPathname.endsWith(toPathname) &&
        locationPathname.charAt(endSlashPosition) === "/");
    const check_isPendding = location.isNavigating;

    return (
      <Link
        class={`
          ${props.class}  
          ${check_isActive ? isActive : ""}
          ${check_isPendding && check_isActive ? isPending : ""}
        `}
        {...props}
      >
        <Slot />
      </Link>
    );
  },
);
