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
import exampleSections, { ExampleApp } from '@examples-data';

const Examples = component$((props: ExamplesProp) => {
  const hostElm = useHostElement();

  const store = useStore<ExamplesStore>(() => {
    //  /examples/section/app-id
    const app = getExampleApp(props.appId);
    return {
      appId: props.appId,
      app,
    };
  });

  useWatch$((track) => {
    const appId = track(store, 'appId');
    store.app = getExampleApp(appId);
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
          {exampleSections.map((s) => (
            <div key={s.id} class="examples-menu-section">
              <h2>{s.title}</h2>

              {s.apps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick$={() => {
                    store.appId = app.id;
                    history.replaceState(null, '', `/examples/${app.id}`);
                  }}
                  class={{
                    'example-button': true,
                    selected: store.appId === app.id,
                  }}
                >
                  <h3>{app.title}</h3>
                  <p>{app.description}</p>
                </button>
              ))}
            </div>
          ))}
        </div>

        <main class="examples-repl">
          {store.app ? (
            <Repl
              inputs={store.app.inputs}
              entryStrategy={'hook'}
              enableSsrOutput={false}
              enableClientOutput={false}
              enableHtmlOutput={false}
            />
          ) : (
            <p>Unable to find example app "{store.appId}"</p>
          )}
        </main>
      </div>
    </Host>
  );
});

export const getExampleApp = (id: string): ExampleApp | undefined => {
  for (const exampleSection of exampleSections) {
    for (const app of exampleSection.apps) {
      if (app.id === id) {
        return app;
      }
    }
  }
};

interface ExamplesProp {
  appId: string;
}

interface ExamplesStore {
  appId: string;
  app: ExampleApp | undefined;
}

export default Examples;
