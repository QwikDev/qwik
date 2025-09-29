import exampleSections, { type ExampleApp } from '@examples-data';
import {
  component$,
  isBrowser,
  useStore,
  useStyles$,
  useTask$,
  useVisibleTask$,
} from '@qwik.dev/core';
import type { PathParams, RequestHandler, StaticGenerateHandler } from '@qwik.dev/router';
import { useLocation, type DocumentHead } from '@qwik.dev/router';
import { Header } from '../../../components/header/header';
import { PanelToggle } from '../../../components/panel-toggle/panel-toggle';
import type { ReplAppInput } from '../../../repl/types';
import { Repl } from '../../../repl/ui';
import { createPlaygroundShareUrl, parsePlaygroundShareUrl } from '../../../repl/ui/repl-share-url';
import { setReplCorsHeaders } from '~/utils/utils';
import styles from './examples.css?inline';

export default component$(() => {
  useStyles$(styles);

  const panelStore = useStore(() => ({
    active: 'Input',
    list: PANELS,
  }));

  const loc = useLocation();
  const store = useStore<ExamplesStore>(() => {
    const app = getExampleApp(loc.params.id);
    const initStore: ExamplesStore = {
      appId: app ? app.id : '',
      buildMode: 'development',
      entryStrategy: 'segment',
      files: app?.inputs || [],
      version: '',
      shareUrlTmr: undefined,
    };
    return initStore;
  });

  useTask$(({ track }) => {
    const appId = track(() => store.appId);
    const app = getExampleApp(appId);
    if (isBrowser) {
      const shareData = parsePlaygroundShareUrl(location.hash.slice(1));
      if (shareData) {
        store.version = shareData.version;
        store.buildMode = shareData.buildMode;
        store.entryStrategy = shareData.entryStrategy;
        store.files = shareData.files;
        document.title = `REPL Playground - Qwik`;
        return;
      }
    }
    store.files = app?.inputs || [];
    if (typeof document !== 'undefined') {
      document.title = `${app?.title} - Qwik`;
    }
  });

  useVisibleTask$(() => {
    const shareData = parsePlaygroundShareUrl(location.hash.slice(1));
    if (shareData) {
      store.version = shareData.version;
      store.buildMode = shareData.buildMode;
      store.entryStrategy = shareData.entryStrategy;
      store.files = shareData.files;
      document.title = `REPL Playground - Qwik`;
      return;
    }
  });

  useTask$(({ track }) => {
    track(() => store.buildMode);
    track(() => store.entryStrategy);
    track(() => store.version);
    track(() => store.files.forEach((f) => f.code));

    if (isBrowser) {
      if (store.version) {
        clearTimeout(store.shareUrlTmr);

        store.shareUrlTmr = setTimeout(() => {
          const shareUrl = createPlaygroundShareUrl(store, location.pathname);
          history.replaceState({}, '', shareUrl);
        }, 1000);
      }
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
            href="https://github.com/QwikDev/qwik/tree/main/packages/docs/src/routes/examples/apps/"
            class="example-button-new"
            target="_blank"
          >
            👏 Add new examples
          </a>
        </div>

        <main class="examples-repl">
          <div class="repl">
            <Repl input={store} enableDownload={true} />
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
  shareUrlTmr: any;
}

type ActivePanel = 'Examples' | 'Input' | 'Output' | 'Console';

export const onGet: RequestHandler = ({ cacheControl, headers }) => {
  cacheControl({
    public: true,
    maxAge: 3600,
  });
  setReplCorsHeaders(headers);
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
    }, [] as PathParams[]),
  };
};
