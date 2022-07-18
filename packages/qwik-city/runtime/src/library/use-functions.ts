import { useContext } from '@builder.io/qwik';
import { ContentContext, DocumentHeadContext, RouteLocationContext } from './constants';
import type { ContentHeading, RouteLocation, ResolvedDocumentHead } from './types';

/**
 * @public
 */
export const useContentHeadings = (): ContentHeading[] | undefined =>
  useContext(ContentContext).headings;

/**
 * @public
 */
export const useContentMenu = () => useContext(ContentContext).menu;

/**
 * @public
 */
export const useDocumentHead = (): Required<ResolvedDocumentHead> =>
  useContext(DocumentHeadContext);

/**
 * @public
 */
export const useLocation = (): RouteLocation => useContext(RouteLocationContext);
