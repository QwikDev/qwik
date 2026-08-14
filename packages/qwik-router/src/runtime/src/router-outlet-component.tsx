import { component$, sync$, useContext, useServerData } from '@qwik.dev/core';
import { RoutedLevelsContext } from './contexts';
import { linkPrefetchInit } from './link-prefetch';
import type { ClientSPAWindow } from './qwik-router-component';
import type { ScrollHistoryState } from './scroll-restoration';
import { type RouterPopstateEventDetail } from './spa-init';
import spaInit from './spa-init';
import type { RouteNavigate } from './types';
import { useDocumentHead, useNavigate } from './use-functions';

export const handleRouterPopstate = (
  nav: RouteNavigate,
  event: Event | CustomEvent<RouterPopstateEventDetail>
) => {
  const href = (event as CustomEvent<RouterPopstateEventDetail>).detail?.href;
  if (href) {
    return nav(href, { type: 'popstate' });
  }
};

const assertServerData = (serverData: Record<string, string> | undefined) => {
  if (!serverData) {
    throw new Error('PrefetchServiceWorker component must be rendered on the server.');
  }
};

interface RoutedContentProps {
  level: number;
}

/**
 * One route level. The collection subscribes to this level's signal only, so a nav rebuilds exactly
 * the levels whose module changed; untouched layouts keep their instances mounted.
 */
function RoutedContent({ level }: RoutedContentProps) {
  const levels = useContext(RoutedLevelsContext);
  const cmp = levels.signals[level];
  return (
    <>
      {[cmp.value].map((Cmp) => {
        const RoutedComponent = Cmp as any;
        return Cmp ? (
          <RoutedComponent>
            <RoutedContent level={level + 1} />
          </RoutedComponent>
        ) : null;
      })}
    </>
  );
}

/** @public */
export const RouterOutlet = component$(() => {
  const serverData = useServerData<Record<string, string>>('containerAttributes');
  assertServerData(serverData);
  const head = useDocumentHead();
  const nav = useNavigate();
  return (
    <>
      <RoutedContent level={0} />
      {!__EXPERIMENTAL__.noSPA && (
        <script
          document:onQCInit$={[spaInit, linkPrefetchInit(head.manifestHash)]}
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
});
