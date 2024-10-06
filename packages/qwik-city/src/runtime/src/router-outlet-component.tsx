import {
  component$,
  jsx,
  type JSXNode,
  SkipRender,
  useContext,
  _jsxBranch,
  useServerData,
  sync$,
} from '@builder.io/qwik';

import { ContentInternalContext } from './contexts';
import spaInit from './spa-init';
import type { ClientSPAWindow } from './qwik-city-component';
import type { ScrollHistoryState } from './scroll-restoration';

/** @public */
export const RouterOutlet = component$(() => {
  const serverData = useServerData<Record<string, string>>('containerAttributes');
  if (!serverData) {
    throw new Error('PrefetchServiceWorker component must be rendered on the server.');
  }
  _jsxBranch();

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
              ((window: ClientSPAWindow, history: History & { state?: ScrollHistoryState }) => {
                if (!window._qcs && history.scrollRestoration === 'manual') {
                  window._qcs = true;

                  const scrollState = history.state?._qCityScroll;
                  if (scrollState) {
                    window.scrollTo(scrollState.x, scrollState.y);
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
