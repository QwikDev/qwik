import { useContext } from '@builder.io/qwik';
import { PageContext } from './constants';
import type { Page } from './types';

/**
 * @public
 */
export const usePage = (): Page | undefined => {
  const page = useContext(PageContext);
  return page.head ? page : undefined;
};
