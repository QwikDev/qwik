import type { LoadedContent, LoadedRoute, Page, PageModule } from './types';
import { component$, jsx, useContext } from '@builder.io/qwik';
import { ContentContext, JsxSkipRerender } from './constants';

export const updateContent = async (
  loadedRoute: LoadedRoute | null
): Promise<LoadedContent | null> => {
  if (loadedRoute) {
    const modules = loadedRoute.modules;
    const pageModule = modules[modules.length - 1] as PageModule;

    const page: Page = {
      breadcrumbs: pageModule.breadcrumbs,
      head: {},
      headings: pageModule.headings,
      menu: pageModule.menu,
    };

    return { ...loadedRoute, pageModule, page };
  }
  return null;
};

/**
 * @public
 */
export const Content = component$(() => {
  const modules = useContext(ContentContext).modules;
  const modulesLen = modules.length;

  if (modulesLen > 0) {
    let cmp: any = jsx(modules[modulesLen - 1].default, null);

    for (let i = modulesLen - 2; i >= 0; i--) {
      cmp = jsx(modules[i].default, {
        children: [cmp],
      });
    }

    return cmp;
  }

  return JsxSkipRerender;
});
