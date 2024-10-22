import {
  component$,
  jsx,
  type JSXNode,
  SkipRender,
  sync$,
  useContext,
  useServerData,
} from '@qwik.dev/core';

import { ContentInternalContext } from './contexts';
import type { ClientSPAWindow } from './qwik-router-component';
import type { ScrollHistoryState } from './scroll-restoration';
import spaInit from './spa-init';

/** @public */
export const RouterOutlet = component$(() => {
  const serverData = useServerData<Record<string, string>>('containerAttributes');
  if (!serverData) {
    throw new Error('PrefetchServiceWorker component must be rendered on the server.');
  }

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
        {!__EXPERIMENTAL__.noSPA && (
          <script
            document:onQCInit$={spaInit}
            document:onQInit$={sync$(() => {
              // Minify window and history
              // Write this as minified as possible, the optimizer does not really minify this code.
              ((w: ClientSPAWindow, h: History & { state?: ScrollHistoryState }) => {
                if (!w._qcs && h.scrollRestoration === 'manual') {
                  // true
                  w._qcs = !0;

                  // scrollState
                  const s = h.state?._qRouterScroll;
                  if (s) {
                    w.scrollTo(s.x, s.y);
                  }
                  document.dispatchEvent(new Event('qcinit'));
                }
              })(window, history);
            })}
          ></script>
        )}
      </>
    );
  }
  return SkipRender;
});