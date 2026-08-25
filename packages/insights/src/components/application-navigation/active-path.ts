export const isNavigationItemActive = (pathname: string, href: string, exact = false) =>
  exact ? pathname === href : pathname.startsWith(href);
