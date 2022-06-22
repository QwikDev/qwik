import { jsx } from '@builder.io/qwik';
import { JsxSkipRerender } from './constants';
import type { LoadedContent, LoadedRoute, Page, PageModule, ContentModule } from './types';

export const updateContent = async (
  loadedRoute: LoadedRoute | null
): Promise<LoadedContent | null> => {
  if (loadedRoute) {
    const modules = loadedRoute.modules;
    const pageModule = modules[modules.length - 1] as PageModule;

    const page: Page = {
      breadcrumbs: pageModule.breadcrumbs,
      head: {
        title: '',
        meta: {},
        links: [],
        scripts: [],
        styles: [],
      },
      headings: pageModule.headings,
      menu: pageModule.menu,
    };

    return { ...loadedRoute, pageModule, page };
  }
  return null;
};

export const createContentCmp = (modules: ContentModule[]) => {
  return () => {
    const modulesLen = modules.length;

    if (modulesLen > 0) {
      let cmp: any = jsx(modules[modulesLen - 1].default, null);

      for (let i = modulesLen - 2; i >= 0; i--) {
        cmp = jsx(modules[i].default, {
          children: cmp,
        });
      }

      return cmp;
    }

    return JsxSkipRerender;
  };
};
