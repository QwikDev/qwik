import { INDEXES } from '@builder.io/qwik-city/build';
import { useLocation } from './location';
import type { PageIndex } from './types';
import { normalizeUrl } from './utils';

/**
 * @public
 */
export const usePageIndex = () => {
  const loc = useLocation();
  const page = loadIndex(loc.href);
  return page;
};

const loadIndex = (href: string): PageIndex | null => {
  let pathname = normalizeUrl(href).pathname;

  for (let i = 0; i < 9; i++) {
    if (INDEXES[pathname]) {
      return INDEXES[pathname];
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
