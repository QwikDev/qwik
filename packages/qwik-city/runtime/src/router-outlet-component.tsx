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
// TODO!!! Finalize imports here after SPA recovery determined.
// TODO!!! Reset innerHTML below.
// import popStateScript from './init-popstate.txt?raw';
//@ts-ignore
import popStateScript from './init-popstate';

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
          dangerouslySetInnerHTML={`(${popStateScript.toString()})();`}
          nonce={nonce}
        ></script>
      </>
    );
  }
  return SkipRender;
});
