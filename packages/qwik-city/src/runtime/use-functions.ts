import { useContext, useDocument } from '@builder.io/qwik';
import { QwikCityContext } from './constants';
import type { DocumentHead, Menu, Page, Route } from './types';

/**
 * @public
 */
export const useDocumentHead = (): DocumentHead => useContext(QwikCityContext).head;

/**
 * @public
 */
export const usePage = (): Page => useContext(QwikCityContext).page;

/**
 * @public
 */
export const useRoute = (): Route => useContext(QwikCityContext).route;

/**
 * @public
 */
export const useLocation = () => {
  const doc = useDocument();
  const loc = doc.defaultView!.location;
  const url = new URL(loc.pathname + loc.search + loc.hash, loc.origin);

  return {
    href: url.href,
    pathname: url.pathname,
    search: url.search,
    searchParams: url.searchParams,
    hash: url.hash,
    origin: url.origin,
  };
};

/**
 * @public
 */
export const useMenu = (): Menu | null => {
  const loc = useLocation();

  let pathname = loc.pathname;

  for (let i = 0; i < 9; i++) {
    // if (menus[pathname]) {
    //   return menus[pathname];
    // }
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
