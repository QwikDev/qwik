import { BUILD_ID, INLINED_MODULES, LAYOUTS, PAGES } from '@builder.io/qwik-city/build';
import type { PageHandler } from './types';
import { normalizeUrl } from './utils';
import { useLocation } from './location';

/**
 * @public
 */
export const usePage = async (hostElm: any) => {
  const loc = useLocation(hostElm);
  const page = await loadPage(loc.href);
  return page;
};

const loadPage = async (href: string): Promise<PageHandler | null> => {
  let mod: any = null;

  const url = normalizeUrl(href);
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

  const layoutImporter = LAYOUTS[mod.attributes.layout] || LAYOUTS.default;
  if (!layoutImporter) {
    return null;
  }

  const layout = await layoutImporter();

  return {
    attributes: mod.attributes,
    breadcrumbs: mod.breadcrumbs,
    content: mod.default,
    headings: mod.headings,
    index: mod.index,
    layout: layout.default,
    source: mod.source,
    url,
  };
};

const IS_CLIENT = typeof document !== 'undefined';
