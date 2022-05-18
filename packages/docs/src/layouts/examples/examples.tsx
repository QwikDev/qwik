import {
  component$,
  Host,
  useHostElement,
  useScopedStyles$,
  useWatch$,
  useStore,
} from '@builder.io/qwik';

import { Repl } from '../../components/repl/repl';
import styles from './examples.css?inline';
import { Header } from '../../components/header/header';
import { setHeadMeta, setHeadStyles } from '@builder.io/qwik-city';
import exampleApps, { ExampleApp } from '@examples-data';

const Examples = component$(() => {
  const hostElm = useHostElement();

  const store = useStore<ExamplesStore>(() => {
    return {
      appId: 'hello-world',
      app: loadPlaygroundStore('hello-world')!,
    };
  });

  useWatch$((track) => {
    const appId = track(store, 'appId');
    const newApp = loadPlaygroundStore(appId);
    if (newApp) {
      store.app = newApp;
    }
  });

  useWatch$(() => {
    setHeadMeta(hostElm, { title: `Qwik Examples` });
    setHeadStyles(hostElm, [
      {
        style: `html,body { margin: 0; height: 100%; overflow: hidden; }`,
      },
    ]);
  });

  useScopedStyles$(styles);

  return (
    <Host class="examples">
      <Header />

      <div class="examples-menu-container">
        <div class="examples-menu">
          {exampleApps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick$={() => {
                store.appId = app.id;
              }}
              class={{
                'example-button': true,
                selected: store.appId === app.id,
              }}
            >
              <h2>{app.title}</h2>
              <p>{app.description}</p>
            </button>
          ))}
        </div>
        <main class="examples-repl">
          <Repl
            inputs={store.app.inputs}
            entryStrategy={'hook'}
            enableSsrOutput={false}
            enableClientOutput={false}
            enableHtmlOutput={false}
          />
        </main>
      </div>
    </Host>
  );
});

export function loadPlaygroundStore(id: string): ExampleApp | undefined {
  return exampleApps.find((p) => p.id === id)!;
}

interface ExamplesStore {
  appId: string;
  app: ExampleApp;
}

export default Examples;
