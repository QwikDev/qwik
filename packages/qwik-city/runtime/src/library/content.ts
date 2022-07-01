import { component$, jsx, SkipRerender, useContext } from '@builder.io/qwik';
import { ContentContext } from './constants';

/**
 * @public
 */
export const Content = component$(() => {
  const modules = useContext(ContentContext).modules;
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
