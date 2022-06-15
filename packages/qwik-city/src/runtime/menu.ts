import { menus } from './qwik-city-module';
import { useLocation } from './use-location';
import type { Menu } from './types';

/**
 * @public
 */
export const useMenu = (): Menu | null => {
  const loc = useLocation();

  let pathname = loc.pathname;

  for (let i = 0; i < 9; i++) {
    if (menus[pathname]) {
      return menus[pathname];
    }
    if (pathname === '/') {
      break;
    }
    const parts = pathname.split('/');
    parts.pop();
    pathname = parts.join('/');
    if (!pathname.startsWith('/')) {
      pathname = '/' + pathname;
    }
  }

  return null;
};
