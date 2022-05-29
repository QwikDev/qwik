import {
  component$,
  Host,
  useScopedStyles$,
  useWatch$,
  useStore,
  useStyles$,
} from '@builder.io/qwik';
import { Repl } from '../../components/repl/repl';
import styles from './examples.css?inline';
import { Header } from '../../components/header/header';
import { useHeadMeta } from '@builder.io/qwik-city';
import exampleSections, { ExampleApp } from '@examples-data';
import type { ReplAppInput } from '../../components/repl/types';

const Examples = component$((props: ExamplesProp) => {
  useHeadMeta({ title: `Qwik Examples` });
  useStyles$(`html,body { margin: 0; height: 100%; overflow: hidden; }`);

  const store = useStore<ExamplesStore>(() => {
    //  /examples/section/app-id
    const app = getExampleApp(props.appId);

    const initStore: ExamplesStore = {
      appId: props.appId,
      buildId: 0,
      buildMode: 'development',
      entryStrategy: 'hook',
      files: app?.inputs || [],
      version: '',
    };
    return initStore;
  });

  useWatch$((track) => {
    const appId = track(store, 'appId');
    const app = getExampleApp(appId);
    store.files = app?.inputs || [];
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
                  <div class="example-button-icon">{app.icon}</div>
                  <div class="example-button-content">
                    <h3>{app.title}</h3>
                    <p>{app.description}</p>
                  </div>
                </button>
              ))}
            </div>
          ))}
          <a
            href="https://github.com/BuilderIO/qwik/tree/main/packages/docs/pages/examples"
            class="example-button-new"
          >
            👏 Add new examples
          </a>
        </div>

        <main class="examples-repl">
          <Repl
            input={store}
            enableSsrOutput={false}
            enableClientOutput={false}
            enableHtmlOutput={false}
          />
        </main>
      </div>
    </Host>
  );
});

export const getExampleApp = (id: string): ExampleApp | undefined => {
  for (const exampleSection of exampleSections) {
    for (const app of exampleSection.apps) {
      if (app.id === id) {
        return JSON.parse(JSON.stringify(app));
      }
    }
  }
};

interface ExamplesProp {
  appId: string;
}

interface ExamplesStore extends ReplAppInput {
  appId: string;
}

export default Examples;
