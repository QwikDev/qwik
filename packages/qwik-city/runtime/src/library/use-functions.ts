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
  const ctx = useContext(QwikCityContext);
  const loc = ctx.location;
  const menus = ctx.menus;
  const parts = loc.pathname.split('/');
  let cursorPathname = loc.pathname;

  if (menus) {
    for (let i = 0; i < 9; i++) {
      if (menus[cursorPathname]) {
        return menus[cursorPathname];
      }
      if (cursorPathname === '/') {
        break;
      }
      parts.pop();
      cursorPathname = parts.join('/');
    }
  }

  return undefined;
};
