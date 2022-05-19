import {
  useContext,
  createContext,
  useWaitOn,
  useStore,
  noSerialize,
  useContextProvider,
} from '@builder.io/qwik';
import { BUILD_ID, INLINED_MODULES, LAYOUTS, PAGES } from '@builder.io/qwik-city/build';
import type { PageHandler } from './types';
import { normalizeUrl } from './utils';
import { useLocation } from './location';

export const QwikCityContext = createContext<PageHandler>('qwikcity-page');

/**
 * @alpha
 */
export const useQwikCity = () => {
  const href = useLocation().href;
  const page = useStore<PageHandler>({} as any);
  useWaitOn(
    loadPage(href).then((loaded) => {
      if (loaded) {
        Object.assign(page, {
          attributes: loaded.attributes,
          breadcrumbs: loaded.breadcrumbs,
          headings: loaded.headings,
          index: loaded.index,
          source: loaded.source,
          url: loaded.url.href,
          content: noSerialize(loaded.content),
          layout: noSerialize(loaded.layout),
        });
      }
    })
  );
  useContextProvider(QwikCityContext, page);
};

/**
 * @public
 */
export const usePage = (): PageHandler | undefined => {
  const page = useContext(QwikCityContext);
  return page.content ? page : undefined;
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
