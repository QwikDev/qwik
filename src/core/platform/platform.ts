import type { CorePlatform } from './types';

export const corePlatform: CorePlatform = {
  import: (url: string) => import(url),
  toPath: (url: URL) => {
    url = new URL(String(url));
    url.hash = '';
    url.search = '';
    return url.href;
  },
};

/**
 * @public
 */
export const setPlatform = (plt: CorePlatform) => Object.assign(corePlatform, plt);
