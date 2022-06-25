import { component$, jsx, SkipRerender, useContext } from '@builder.io/qwik';
import { QwikCityContext } from './constants';
import type { LoadedContent, LoadedRoute, PageModule } from './types';

/**
 * @public
 */
export const Content = component$(() => {
  const ctx = useContext(QwikCityContext);
  const modules = ctx.modules;
  const modulesLen = modules.length;

  if (modulesLen > 0) {
    let cmp: any = jsx(modules[modulesLen - 1].default, {});

    for (let i = modulesLen - 2; i >= 0; i--) {
      cmp = jsx(modules[i].default, {
        children: cmp,
      });
    }

    return cmp;
  }

  return jsx(SkipRerender, {});
});

export const updateContent = async (
  loadedRoute: LoadedRoute | null
): Promise<LoadedContent | null> => {
  if (loadedRoute) {
    const modules = loadedRoute.modules;
    const pageModule = modules[modules.length - 1] as PageModule;
    return { ...loadedRoute, pageModule };
  }
  return null;
};
