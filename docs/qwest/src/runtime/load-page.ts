import { BUILD_ID, INLINED_MODULES, LAYOUTS, PAGES } from '@builder.io/qwest/build';
import type { LoadIndexOptions, PageHandler } from './types';

/**
 * @public
 */
export const loadPage = async (opts: LoadIndexOptions): Promise<PageHandler | null> => {
  let mod: any = null;
  const pathname = opts.pathname.endsWith('/') ? opts.pathname + 'index' : opts.pathname;

  if (INLINED_MODULES) {
    // all page modules are inlined into the same bundle
    const pageImporter = PAGES[pathname];
    if (!pageImporter) {
      return null;
    }

    mod = await pageImporter();
  } else {
    // page modules are dynamically imported
    try {
      // ./pages/guide/getting-started.js
      let pagePath = './pages' + pathname + '.js';
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
  };
};

const IS_CLIENT = typeof document !== 'undefined';
