import { component$, jsx, JSXNode, SkipRender, useContext } from '@builder.io/qwik';
import { ContentInternalContext } from './contexts';

/**
 * @alpha
 */
export const RouterOutlet = component$(() => {
  const { contents } = useContext(ContentInternalContext);
  if (contents && contents.length > 0) {
    const contentsLen = contents.length;
    let cmp: JSXNode | null = null;
    for (let i = contentsLen - 1; i >= 0; i--) {
      cmp = jsx(contents[i].default, {
        children: cmp,
      });
    }
    return cmp;
  }
  return SkipRender;
});

/**
 * @deprecated Please use `RouterOutlet` instead.
 * @alpha
 */
export const Content = RouterOutlet;
