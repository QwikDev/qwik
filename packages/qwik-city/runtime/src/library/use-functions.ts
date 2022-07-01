import { useContext } from '@builder.io/qwik';
import {
  ContentContext,
  ContentMenusContext,
  DocumentHeadContext,
  RouteLocationContext,
} from './constants';
import type {
  DocumentHead,
  ContentMenu,
  ContentHeading,
  ContentBreadcrumb,
  RouteLocation,
} from './types';

/**
 * @public
 */
export const useContentBreadcrumbs = (): ContentBreadcrumb[] | undefined =>
  useContext(ContentContext).breadcrumbs;

/**
 * @public
 */
export const useContentHeadings = (): ContentHeading[] | undefined =>
  useContext(ContentContext).headings;

/**
 * @public
 */
export const useDocumentHead = (): DocumentHead => useContext(DocumentHeadContext);

/**
 * @public
 */
export const useLocation = (): RouteLocation => useContext(RouteLocationContext);

/**
 * @public
 */
export const useContentMenu = (): ContentMenu | undefined => {
  const menus = useContext(ContentMenusContext);
  const loc = useLocation();
  const parts = loc.pathname.split('/');

  if (menus) {
    let cursorPathname = loc.pathname;
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
