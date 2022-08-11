import { component$, jsx, SkipRerender, useContext } from '@builder.io/qwik';
import { ContentInternalContext } from './contexts';

/**
 * @alpha
 */
export const RouterOutlet = component$(() => {
  const { contents } = useContext(ContentInternalContext);
  if (contents && contents.length > 0) {
    const contentsLen = contents.length;
    let cmp: any = jsx(contents[contentsLen - 1].default, {});
    let i = contentsLen - 2;

    for (; i >= 0; i--) {
      cmp = jsx(contents[i].default, {
        children: cmp,
      });
    }

    return cmp;
  }

  return jsx(SkipRerender, {});
});

/**
 * @deprecated Please use `RouterOutlet` instead.
 * @alpha
 */
export const Content = RouterOutlet;
