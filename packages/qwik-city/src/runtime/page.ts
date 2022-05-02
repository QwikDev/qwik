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
  let pageModule: any = null;

  const url = normalizeUrl(href);
  const modulePath = url.pathname.endsWith('/') ? url.pathname + 'index' : url.pathname;

  if (INLINED_MODULES) {
    // all page modules are inlined into the same bundle
    const pageImporter = PAGES[modulePath];
    if (!pageImporter) {
      return null;
    }

    pageModule = await pageImporter();
  } else {
    // page modules are dynamically imported
    try {
      // ./pages/guide/getting-started.js
      const pagePath = `./pages${modulePath}.js?v=${BUILD_ID}`;
      pageModule = await import(/* @vite-ignore */ pagePath);
    } catch (e) {
      console.error(e);
      return null;
    }
  }
  if (!pageModule || !pageModule.default) {
    return null;
  }

  const layoutImporter = LAYOUTS[pageModule.attributes.layout] || LAYOUTS.default;
  if (!layoutImporter) {
    return null;
  }

  const layout = await layoutImporter();
  const layoutModule = layout.default || layout;

  return {
    attributes: pageModule.attributes,
    breadcrumbs: pageModule.breadcrumbs,
    content: pageModule.default,
    headings: pageModule.headings,
    index: pageModule.index,
    layout: layoutModule,
    source: pageModule.source,
    url,
  };
};
