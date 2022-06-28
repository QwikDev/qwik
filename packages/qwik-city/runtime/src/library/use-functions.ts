import { useContext, useDocument } from '@builder.io/qwik';
import { QwikCityContext } from './constants';
import type { DocumentHead, ContentMenu } from './types';

/**
 * @public
 */
export const useDocumentHead = (): DocumentHead => useContext(QwikCityContext).head;

/**
 * @public
 */
export const useContentBreadcrumbs = () => useContext(QwikCityContext).breadcrumbs;

/**
 * @public
 */
export const useContentHeadings = () => useContext(QwikCityContext).headings;

/**
 * @public
 */
export const useLocation = () => useContext(QwikCityContext).location;

export const useDocumentLocation = () => {
  const doc = useDocument();
  return new URL(doc.defaultView!.location.href);
};

/**
 * @public
 */
export const useContentMenu = (): ContentMenu | undefined => {
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
  return undefined;
};
