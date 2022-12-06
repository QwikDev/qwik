import { component$, useStyles$, useWatch$, useStore } from '@builder.io/qwik';
import type { RequestHandler, RouteParams, StaticGenerateHandler } from '@builder.io/qwik-city';
import { Repl } from '../../../repl/repl';
import styles from './examples.css?inline';
import { Header } from '../../../components/header/header';
import exampleSections, { ExampleApp } from '@examples-data';
import type { ReplAppInput } from '../../../repl/types';
import { DocumentHead, useLocation } from '@builder.io/qwik-city';
import { PanelToggle } from '../../../components/panel-toggle/panel-toggle';

export default component$(() => {
  useStyles$(styles);

  const panelStore = useStore(() => ({
    active: 'Input',
    list: PANELS,
  }));

  const store = useStore<ExamplesStore>(() => {
    const { params } = useLocation();
    const app = getExampleApp(params.id);
    const initStore: ExamplesStore = {
      appId: app ? app.id : '',
      buildId: 0,
      buildMode: 'development',
      entryStrategy: 'hook',
      files: app?.inputs || [],
      version: '',
    };
    return initStore;
  });

  useWatch$(({ track }) => {
    const appId = track(() => store.appId);
    const app = getExampleApp(appId);
    store.files = app?.inputs || [];
    if (typeof document !== 'undefined') {
      document.title = `${app?.title} - Qwik`;
    }
  });

  return (
    <div class="examples full-width fixed-header">
      <Header />

      <div
        class={{
          'examples-menu-container': true,
          'examples-panel-input': panelStore.active === 'Input',
          'examples-panel-output': panelStore.active === 'Output',
          'examples-panel-console': panelStore.active === 'Console',
        }}
      >
        <div class="examples-menu">
          {exampleSections.map((s) => (
            <article key={s.id} class="examples-menu-section">
              <h2>{s.title}</h2>

              {s.apps.map((app) => (
                <a
                  key={app.id}
                  href={`/examples/${app.id}/`}
                  preventdefault:click
                  onClick$={() => {
                    store.appId = app.id;
                    panelStore.active === 'Input';
                    history.replaceState({}, '', `/examples/${app.id}/`);
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
                </a>
              ))}
            </article>
          ))}
          <a
            href="https://github.com/BuilderIO/qwik/tree/main/packages/docs/src/routes/examples/apps/"
            class="example-button-new"
            target="_blank"
          >
            👏 Add new examples
          </a>
        </div>

        <main class="examples-repl">
          <div class="repl">
            <Repl
              input={store}
              enableSsrOutput={false}
              enableClientOutput={false}
              enableHtmlOutput={false}
              enableCopyToPlayground={true}
              enableDownload={true}
              enableInputDelete={false}
            />
          </div>
        </main>
      </div>
      <PanelToggle panelStore={panelStore} />
    </div>
  );
});

export const getExampleApp = (id: string): ExampleApp | undefined => {
  if (id.endsWith('/')) {
    id = id.slice(0, id.length - 1);
  }
  for (const exampleSection of exampleSections) {
    for (const app of exampleSection.apps) {
      if (app.id === id) {
        return JSON.parse(JSON.stringify(app));
      }
    }
  }
};

export const head: DocumentHead = ({ params }) => {
  const app = getExampleApp(params.id);
  return {
    title: app?.title || 'Example',
  };
};

export const PANELS: ActivePanel[] = ['Examples', 'Input', 'Output', 'Console'];

interface ExamplesStore extends ReplAppInput {
  appId: string;
}

type ActivePanel = 'Examples' | 'Input' | 'Output' | 'Console';

export const onGet: RequestHandler = ({ response }) => {
  response.headers.set(
    'Cache-Control',
    'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
  );
};

export const onStaticGenerate: StaticGenerateHandler = () => {
  return {
    params: exampleSections.reduce((params, section) => {
      section.apps.forEach((app) => {
        params.push({
          id: app.id,
        });
      });
      return params;
    }, [] as RouteParams[]),
  };
};
