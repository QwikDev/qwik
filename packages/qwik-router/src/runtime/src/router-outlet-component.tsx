import { component$, sync$, useContext, useServerData } from '@qwik.dev/core';
import { ContentInternalContext } from './contexts';
import { linkPrefetchInit } from './link-prefetch';
import type { ClientSPAWindow } from './qwik-router-component';
import type { ScrollHistoryState } from './scroll-restoration';
import { type RouterPopstateEventDetail } from './spa-init';
import spaInit from './spa-init';
import type { ContentModule, RouteNavigate } from './types';
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
  contents: ContentModule[];
  index: number;
  component: ContentModule['default'];
}

function RoutedContent({ contents, index, component: Component }: RoutedContentProps) {
  const nextIndex = index + 1;
  const RoutedComponent = Component as any;
  return Component ? (
    <RoutedComponent>
      {nextIndex < contents.length && (
        <RoutedContent
          contents={contents}
          index={nextIndex}
          component={contents[nextIndex].default}
        />
      )}
    </RoutedComponent>
  ) : nextIndex < contents.length ? (
    <RoutedContent contents={contents} index={nextIndex} component={contents[nextIndex].default} />
  ) : null;
}

/** @public */
export const RouterOutlet = component$(() => {
  const serverData = useServerData<Record<string, string>>('containerAttributes');
  assertServerData(serverData);
  const internalContext = useContext(ContentInternalContext);
  const head = useDocumentHead();
  const nav = useNavigate();
  return internalContext.value?.length ? (
    <>
      <RoutedContent
        contents={internalContext.value}
        index={0}
        component={internalContext.value[0].default}
      />
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
  ) : null;
});
