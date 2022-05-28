import {
  $,
  component$,
  Host,
  useScopedStyles$,
  useStore,
  useClientEffect$,
  useStyles$,
} from '@builder.io/qwik';
import { Repl } from '../../components/repl/repl';
import { Header } from '../../components/header/header';
import { getLocation, useHeadMeta } from '@builder.io/qwik-city';
import styles from './playground.css?inline';
import playgroundApp from '@playground-data';
import type { ReplAppInput, ReplModuleInput } from '../../components/repl/types';
import { BUILD_MODE_OPTIONS, ENTRY_STRATEGY_OPTIONS } from '../../components/repl/repl-options';

const Playground = component$(() => {
  useStyles$(`html,body { margin: 0; height: 100%; overflow: hidden; }`);
  useScopedStyles$(styles);
  useHeadMeta({ title: `Qwik Playground` });

  const store = useStore<PlaygroundStore>(() => {
    const initStore: PlaygroundStore = {
      buildId: 0,
      files: playgroundApp.inputs,
      version: '',
      buildMode: 'development',
      entryStrategy: 'hook',
      colResizeActive: false,
      colLeft: 50,
      shareLinkTmr: null,
    };
    return initStore;
  });

  useClientEffect$(() => {
    // run once on the client
    const loc = getLocation(document);
    const shareable = loc.hash.slice(1);
    if (shareable.length > 0) {
      try {
        const params = new URLSearchParams(shareable);

        store.version = params.get('version') || '';

        const buildMode = params.get('buildMode')!;
        if (BUILD_MODE_OPTIONS.includes(buildMode)) {
          store.buildMode = buildMode as any;
        }

        const entryStrategy = params.get('entryStrategy')!;
        if (ENTRY_STRATEGY_OPTIONS.includes(entryStrategy)) {
          store.entryStrategy = entryStrategy as any;
        }

        const encodedFiles = params.get('files')!;
        if (encodedFiles) {
          const files: ReplModuleInput[] = JSON.parse(decodeURIComponent(atob(encodedFiles)));
          if (Array.isArray(files)) {
            store.files = files.filter(
              (f) => typeof f.code === 'string' && typeof f.path === 'string'
            );
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  });

  useClientEffect$((track) => {
    track(store, 'buildId');
    track(store, 'buildMode');
    track(store, 'entryStrategy');
    track(store, 'files');
    track(store, 'version');

    if (store.version) {
      clearTimeout(store.shareLinkTmr);

      store.shareLinkTmr = setTimeout(() => {
        const params = new URLSearchParams();
        params.set('version', store.version);
        params.set('buildMode', store.buildMode);
        params.set('entryStrategy', store.entryStrategy);
        params.set('files', btoa(encodeURIComponent(JSON.stringify(store.files))));

        history.replaceState({}, '', `/playground#${params.toString()}`);
      }, 750);
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
    <Host
      class={{ 'full-width': true, playground: true, 'repl-resize-active': store.colResizeActive }}
    >
      <Header />

      <Repl
        input={store}
        style={{
          gridTemplateColumns: `${store.colLeft}% ${100 - store.colLeft}%`,
        }}
      />

      <div
        class="repl-col-resize-bar"
        onPointerDownQrl={pointerDown}
        onPointerMoveQrl={pointerMove}
        onPointerUpQrl={pointerUp}
        onPointerOutQrl={pointerUp}
        style={{
          left: `calc(${store.colLeft}% - 6px)`,
        }}
      />
    </Host>
  );
});

export interface PlaygroundStore extends ReplAppInput {
  colResizeActive: boolean;
  colLeft: number;
  shareLinkTmr: any;
}

export default Playground;
