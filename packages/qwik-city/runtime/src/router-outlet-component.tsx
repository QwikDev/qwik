import {
  component$,
  jsx,
  type JSXNode,
  SkipRender,
  useContext,
  _IMMUTABLE,
  _jsxBranch,
  _jsxQ,
  useServerData,
} from '@builder.io/qwik';

import { ContentInternalContext } from './contexts';
// TODO Replace spa-init with spa-shim.
// import spaShim from './spa-shim';
import spaInit from './spa-init';

/**
 * @public
 */
export const RouterOutlet = component$(() => {
  _jsxBranch();

  const nonce = useServerData<string | undefined>('nonce');
  const { value } = useContext(ContentInternalContext);
  if (value && value.length > 0) {
    const contentsLen = value.length;
    let cmp: JSXNode | null = null;
    for (let i = contentsLen - 1; i >= 0; i--) {
      if (value[i].default) {
        cmp = jsx(value[i].default, {
          children: cmp,
        });
      }
    }
    return (
      <>
        {cmp}
        <script
          dangerouslySetInnerHTML={`(${spaInit.toString()})(window,location,history,document);`}
          nonce={nonce}
        ></script>
      </>
    );
  }
  return SkipRender;
});
