import { $, component$, useStyles$, useStore, useVisibleTask$, useTask$ } from '@builder.io/qwik';
import type { RequestHandler, DocumentHead } from '@builder.io/qwik-city';
import { Repl } from '../../repl/repl';
import { Header } from '../../components/header/header';
import styles from './playground.css?inline';
import playgroundApp from '@playground-data';
import type { ReplAppInput } from '../../repl/types';
import { createPlaygroundShareUrl, parsePlaygroundShareUrl } from '../../repl/repl-share-url';
import { PanelToggle } from '../../components/panel-toggle/panel-toggle';
import { isBrowser } from '@builder.io/qwik';

export default component$(() => {
  useStyles$(styles);

  const store = useStore<PlaygroundStore>(() => {
    const initStore: PlaygroundStore = {
      buildId: 0,
      files: playgroundApp.inputs,
      version: '',
      buildMode: 'development',
      entryStrategy: 'segment',
      colResizeActive: false,
      colLeft: 50,
      shareUrlTmr: null,
    };
    return initStore;
  });

  const panelStore = useStore(() => ({
    active: 'Input',
    list: ['Input', 'Output', 'Console'],
  }));

  useVisibleTask$(() => {
    // run once on the client
    const shareData = parsePlaygroundShareUrl(location.hash.slice(1));
    if (shareData) {
      store.version = shareData.version;
      store.buildMode = shareData.buildMode;
      store.entryStrategy = shareData.entryStrategy;
      store.files = shareData.files;
    }
  });

  useTask$(({ track }) => {
    track(() => store.buildId);
    track(() => store.buildMode);
    track(() => store.entryStrategy);
    track(() => store.files);
    track(() => store.version);

    if (isBrowser) {
      if (store.version) {
        clearTimeout(store.shareUrlTmr);

        store.shareUrlTmr = setTimeout(() => {
          const shareUrl = createPlaygroundShareUrl(store);
          history.replaceState({}, '', shareUrl);
        }, 1000);
      }
    }
  });

  const pointerDown = $(() => {
    store.colResizeActive = true;
  });

  const pointerMove = $((ev: PointerEvent) => {
    if (store.colResizeActive) {
      store.colLeft = (ev.clientX, ev.clientX / window.innerWidth) * 100;
      store.colLeft = Math.max(25, store.colLeft);
      store.colLeft = Math.min(75, store.colLeft);
    }
  });

  const pointerUp = $(() => {
    store.colResizeActive = false;
  });

  return (
    <div
      class={{
        playground: true,
        'full-width': true,
        'fixed-header': true,
        'repl-resize-active': store.colResizeActive,
      }}
    >
      <Header />

      <div
        class={{
          'repl-panel-output': panelStore.active === 'Output',
          'repl-panel-console': panelStore.active === 'Console',
          repl: true,
        }}
        style={{
          gridTemplateColumns: `${store.colLeft}% ${100 - store.colLeft}%`,
        }}
      >
        <Repl
          input={store}
          enableCopyToPlayground={false}
          enableDownload={true}
          enableInputDelete={true}
        />
      </div>

      <div
        class="repl-col-resize-bar"
        onPointerDown$={pointerDown}
        onPointerMove$={pointerMove}
        onPointerUp$={pointerUp}
        onPointerOut$={pointerUp}
        style={{
          left: `calc(${store.colLeft}% - 6px)`,
        }}
      />
      <PanelToggle panelStore={panelStore} />
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Playground',
};

export interface PlaygroundStore extends ReplAppInput {
  colResizeActive: boolean;
  colLeft: number;
  shareUrlTmr: any;
}

export const onGet: RequestHandler = ({ cacheControl }) => {
  cacheControl({
    public: true,
    maxAge: 3600,
  });
};
