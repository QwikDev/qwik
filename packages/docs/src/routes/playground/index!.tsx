import playgroundApp from '@playground-data';
import {
  $,
  component$,
  isBrowser,
  useSignal,
  useStore,
  useStyles$,
  useTask$,
  useVisibleTask$,
} from '@qwik.dev/core';
import type { DocumentHead, RequestHandler } from '@qwik.dev/router';
import type { ReplAppInput } from '~/repl/types';
import { setReplCorsHeaders } from '~/utils/utils';
import { Header } from '../../components/header/header';
import { PanelToggle } from '../../components/panel-toggle/panel-toggle';
import { Repl } from '../../repl/ui';
import { createPlaygroundShareUrl, parsePlaygroundShareUrl } from '../../repl/ui/repl-share-url';
import styles from './playground.css?inline';

export default component$(() => {
  useStyles$(styles);
  const colResizeActive = useSignal(false);
  const colLeft = useSignal(50);
  const shareUrlTmr = useSignal<any>(null);

  const store = useStore<ReplAppInput>(() => ({
    files: playgroundApp.inputs,
    version: '',
    buildMode: 'development',
    entryStrategy: 'segment',
  }));

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
    track(() => store.buildMode);
    track(() => store.entryStrategy);
    track(() => store.version);
    track(() => store.files.forEach((f) => f.code));

    if (isBrowser) {
      if (store.version) {
        clearTimeout(shareUrlTmr.value);

        shareUrlTmr.value = setTimeout(() => {
          const shareUrl = createPlaygroundShareUrl(store);
          history.replaceState({}, '', shareUrl);
        }, 1000);
      }
    }
  });

  const pointerDown = $(() => {
    colResizeActive.value = true;
  });

  const pointerMove = $((ev: PointerEvent) => {
    if (colResizeActive.value) {
      colLeft.value = (ev.clientX / window.innerWidth) * 100;
      colLeft.value = Math.max(25, colLeft.value);
      colLeft.value = Math.min(75, colLeft.value);
    }
  });

  const pointerUp = $(() => {
    colResizeActive.value = false;
  });

  return (
    <div
      class={{
        playground: true,
        'full-width': true,
        'fixed-header': true,
        'repl-resize-active': colResizeActive.value,
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
          gridTemplateColumns: `${colLeft.value}% ${100 - colLeft.value}%`,
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
          left: `calc(${colLeft.value}% - 6px)`,
        }}
      />
      <PanelToggle panelStore={panelStore} />
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Playground',
};

export const onGet: RequestHandler = ({ cacheControl, headers }) => {
  cacheControl({
    public: true,
    maxAge: 3600,
  });

  setReplCorsHeaders(headers);
};
