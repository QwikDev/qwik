import {
  component$,
  jsx,
  type JSXNode,
  SkipRender,
  useContext,
  _jsxBranch,
  useServerData,
} from '@builder.io/qwik';

import { ContentInternalContext } from './contexts';
import shim from './spa-shim';

/** @public */
export const RouterOutlet = component$(() => {
  const serverData = useServerData<Record<string, string>>('containerAttributes');
  if (!serverData) {
    throw new Error('PrefetchServiceWorker component must be rendered on the server.');
  }
  // TODO Option to remove this shim, especially for MFEs.
  const shimScript = shim(serverData['q:base']);

  _jsxBranch();

  const nonce = useServerData<string | undefined>('nonce');
  const { value } = useContext(ContentInternalContext);
  if (value && value.length > 0) {
    const contentsLen = value.length;
    let cmp: JSXNode | null = null;
    for (let i = contentsLen - 1; i >= 0; i--) {
      if (value[i].default) {
        cmp = jsx(value[i].default as any, {
          children: cmp,
        });
      }
    }
    return (
      <>
        {cmp}
        <script dangerouslySetInnerHTML={shimScript} nonce={nonce}></script>
      </>
    );
  }
  return SkipRender;
});
