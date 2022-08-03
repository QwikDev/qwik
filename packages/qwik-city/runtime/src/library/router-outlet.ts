import { component$, jsx, SkipRerender, useContext } from '@builder.io/qwik';
import { ContentInternalContext } from './contexts';

/**
 * @public
 */
export const RouterOutlet = component$(() => {
  const { contents } = useContext(ContentInternalContext);
  const contentsLen = contents.length;

  if (contentsLen > 0) {
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
 * @public
 */
export const Content = RouterOutlet;
