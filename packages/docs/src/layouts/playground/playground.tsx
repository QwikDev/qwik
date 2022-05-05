import {
  $,
  component$,
  Host,
  useHostElement,
  useScopedStyles$,
  useWatch$,
  useStore,
} from '@builder.io/qwik';
import type { TransformModuleInput } from '@builder.io/qwik/optimizer';
import type { SiteStore } from '../../components/app/app';
import { Repl } from '../../components/repl/repl';
import styles from './playground.css?inline';
import { Header } from '../../components/header/header';
import { setHeadMeta, setHeadStyles } from '@builder.io/qwik-city';
import playgroundApps from './playground-data';

interface PlaygroundLayoutProps {
  store: SiteStore;
}

const Playground = component$((props: PlaygroundLayoutProps) => {
  const hostElm = useHostElement();

  const store = useStore<PlaygroundStore>({
    title: '',
    inputs: [],
    version: '',
    colResizeActive: false,
    colLeft: 50,
  });

  const helloWorldApp = playgroundApps.find((p) => p.id === 'hello-world')!;
  store.title = helloWorldApp.title;
  store.inputs = helloWorldApp.inputs;

  useWatch$(() => {
    setHeadMeta(hostElm, { title: `${store.title} - Qwik Playground` });
    setHeadStyles(hostElm, [
      {
        style: `html,body { margin: 0; height: 100%; overflow: hidden; }`,
      },
    ]);
  });

  useScopedStyles$(styles);

  const pointerDown = $(() => {
    store.colResizeActive = true;
  }) as any;

  const pointerMove = $((ev: PointerEvent) => {
    if (store.colResizeActive) {
      store.colLeft = (ev.clientX, ev.clientX / window.innerWidth) * 100;
      store.colLeft = Math.max(25, store.colLeft);
      store.colLeft = Math.min(75, store.colLeft);
    }
  }) as any;

  const pointerUp = $(() => {
    store.colResizeActive = false;
  }) as any;

  return (
    <Host
      class={{ 'full-width': true, playground: true, 'repl-resize-active': store.colResizeActive }}
    >
      <Header store={props.store} />

      <div class="playground-header" />

      <Repl
        inputs={store.inputs}
        version={store.version}
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

interface PlaygroundStore {
  title: string;
  inputs: TransformModuleInput[];
  version: string;
  colResizeActive: boolean;
  colLeft: number;
}

export default Playground;
