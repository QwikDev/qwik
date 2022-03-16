import { BUILD_ID, INLINED_MODULES, LAYOUTS, PAGES } from '@builder.io/qwest/build';
import type { LoadIndexOptions, PageHandler } from './types';
import { normalizeUrl } from './utils';

/**
 * @public
 */
export const loadPage = async (opts: LoadIndexOptions): Promise<PageHandler | null> => {
  let mod: any = null;

  const url = normalizeUrl(opts.url);
  const modulePath = url.pathname.endsWith('/') ? url.pathname + 'index' : url.pathname;

  if (INLINED_MODULES) {
    // all page modules are inlined into the same bundle
    const pageImporter = PAGES[modulePath];
    if (!pageImporter) {
      return null;
    }

    mod = await pageImporter();
  } else {
    // page modules are dynamically imported
    try {
      // ./pages/guide/getting-started.js
      let pagePath = './pages' + modulePath + '.js';
      if (IS_CLIENT) {
        pagePath += '?v=' + BUILD_ID;
      }

      mod = await import(/* @vite-ignore */ pagePath);
    } catch (e) {
      console.error(e);
      return null;
    }
  }
  if (!mod || !mod.default) {
    return null;
  }

  const layoutImporter = LAYOUTS[mod.layout] || LAYOUTS.default;
  if (!layoutImporter) {
    return null;
  }

  const layout = await layoutImporter();

  return {
    getContent: () => mod.default,
    getLayout: () => layout.default,
    getAttributes: () => mod.attributes,
    getURL: () => url,
  };
};

const IS_CLIENT = typeof document !== 'undefined';
