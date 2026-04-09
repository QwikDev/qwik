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
import { type RouterPopstateEventDetail } from './spa-init';
import spaInit from './spa-init';
import type { RouteNavigate } from './types';
import { useNavigate } from './use-functions';

export const handleRouterPopstate = (
  nav: RouteNavigate,
  event: Event | CustomEvent<RouterPopstateEventDetail>
) => {
  const href = (event as CustomEvent<RouterPopstateEventDetail>).detail?.href;
  if (href) {
    return nav(href, { type: 'popstate' });
  }
};

/** @public */
export const RouterOutlet = component$(() => {
  const serverData = useServerData<Record<string, string>>('containerAttributes');
  if (!serverData) {
    throw new Error('PrefetchServiceWorker component must be rendered on the server.');
  }

  const internalContext = useContext(ContentInternalContext);
  const nav = useNavigate();

  const contents = internalContext.value;

  if (contents && contents.length > 0) {
    const contentsLen = contents.length;
    let cmp: JSXNode | null = null;
    for (let i = contentsLen - 1; i >= 0; i--) {
      if (contents[i].default) {
        cmp = jsx(contents[i].default as any, {
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
            document:onQRouterPopstate$={(event) => handleRouterPopstate(nav, event)}
            document:onQInit$={sync$(() => {
              // Minify window and history
              // Write this as minified as possible, the optimizer does not really minify this code.
              ((w: ClientSPAWindow, h: History & { state?: ScrollHistoryState }) => {
                if (!w._qcs) {
                  // true
                  w._qcs = !0;

                  // scrollState
                  const s = h.state?._qRouterScroll;
                  if (s) {
                    h.scrollRestoration = 'manual';
                    w.scrollTo(s.x, s.y);
                  }
                  // Tell qwikloader to run the spaInit code
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
