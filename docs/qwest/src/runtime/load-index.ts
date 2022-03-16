import { INDEXES } from '@builder.io/qwest/build';
import type { LoadIndexOptions, PageIndex } from './types';

export const loadIndex = async (opts: LoadIndexOptions): Promise<PageIndex | null> => {
  let pathname = opts.pathname;

  for (let i = 0; i < 9; i++) {
    if (INDEXES[pathname]) {
      return INDEXES[pathname];
    }

    const parts = pathname.split('/');
    parts.pop();

    pathname = parts.join('/');
    if (pathname === '/') {
      break;
    }
  }

  return null;
};
