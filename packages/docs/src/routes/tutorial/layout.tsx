import { component$, Slot, useStore, useStyles$, useTask$ } from '@qwik.dev/core';
import type { RequestHandler } from '@qwik.dev/router';
import { useLocation, useNavigate } from '@qwik.dev/router';
import tutorialSections, { type TutorialApp, type TutorialSection } from '@tutorial-data';
import { setReplCorsHeaders } from '~/utils/utils';
import { Header } from '../../components/header/header';
import { PanelToggle } from '../../components/panel-toggle/panel-toggle';
import { EditIcon } from '../../components/svgs/edit-icon';
import type { ReplAppInput, ReplModuleInput } from '../../repl/types';
import { Repl } from '../../repl/ui';
import { TutorialContentFooter } from './tutorial-content-footer';
import styles from './tutorial.css?inline';

export default component$(() => {
  useStyles$(styles);

  const { url } = useLocation();
  const nav = useNavigate();
  const panelStore = useStore(() => ({
    active: 'Tutorial',
    list: PANELS,
  }));

  const store = useStore<TutorialStore>(() => {
    const initStore: TutorialStore = {
      appId: '',
      app: { id: '', title: '', problemInputs: [], solutionInputs: [] },
      prev: undefined,
      next: undefined,
      buildMode: 'development',
      entryStrategy: 'segment',
      files: [],
      version: '',
      isShowingSolution: false,
    };
    return initStore;
  });

  useTask$(({ track }) => {
    track(() => url.pathname);

    const p = url.pathname.split('/');
    const appId = `${p[2]}/${p[3]}`;
    const t = getTutorial(appId) ?? store;

    store.files = ensureDefaultFiles(t.app.problemInputs);
    store.app = t.app;
    store.appId = t.app.id;
    store.prev = t.prev;
    store.next = t.next;
    store.isShowingSolution = false;
  });

  return (
    <div class="tutorial full-width fixed-header repl-theme-docs">
      <Header />
      <main
        class={{
          'tutorial-panel-input': panelStore.active === 'Input',
          'tutorial-panel-output': panelStore.active === 'Output',
        }}
      >
        <article class="tutorial-content-panel">
          <div class="content-main">
            <div class="tutorial-content-shell">
              <div class="tutorial-toolbar">
                <label class="tutorial-lesson-picker">
                  <span>Lesson</span>
                  <select
                    aria-label="Select tutorial lesson"
                    onChange$={(_, elm) => {
                      if (url.pathname !== `/tutorial/${elm.value}/`) {
                        nav(`/tutorial/${elm.value}/`);
                      }
                    }}
                  >
                    {(tutorialSections as TutorialSection[]).map((section) => (
                      <optgroup key={section.id} label={section.title}>
                        {section.apps.map((tutorial) => (
                          <option
                            selected={tutorial.id === store.appId}
                            value={tutorial.id}
                            key={tutorial.id}
                          >
                            {tutorial.title}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <a
                  class="edit-tutorial"
                  href={`https://github.com/QwikDev/qwik/edit/main/packages/docs/src/routes/tutorial/${store.appId}`}
                  target="_blank"
                >
                  <EditIcon width={16} height={16} />
                  <span>Edit tutorial</span>
                </a>
              </div>

              <div class="tutorial-copy">
                <h1>{store.app.title}</h1>

                <div class="tutorial-copy-body">
                  <Slot />
                </div>
              </div>
            </div>
          </div>
        </article>
        <div class="tutorial-repl-panel">
          <div class="tutorial-repl-shell">
            <div class="repl">
              <Repl
                input={store}
                enableHtmlOutput={store.app.enableHtmlOutput}
                enableClientOutput={store.app.enableClientOutput}
                enableSsrOutput={store.app.enableSsrOutput}
                enableCopyToPlayground={false}
                enableDownload={false}
                enableInputDelete={false}
                editorTheme="github-light"
              />
            </div>
          </div>
          <TutorialContentFooter store={store} />
        </div>
      </main>
      <PanelToggle panelStore={panelStore} />
    </div>
  );
});

export const getTutorial = (id: string) => {
  const tutorials: TutorialApp[] = [];
  tutorialSections.forEach((s) => tutorials.push(...s.apps));

  for (let i = 0; i < tutorials.length; i++) {
    if (tutorials[i].id === id) {
      return {
        app: JSON.parse(JSON.stringify(tutorials[i])) as TutorialApp,
        prev: tutorials[i - 1],
        next: tutorials[i + 1],
      };
    }
  }

  return null;
};

export const ensureDefaultFiles = (appFiles: ReplModuleInput[]) => {
  const files: ReplModuleInput[] = JSON.parse(JSON.stringify(appFiles));

  const DEFAULT_ENTRY_SERVER = `
import { renderToString, RenderOptions } from '@qwik.dev/core/server';
import { Root } from './root';

export default function (opts: RenderOptions) {
  return renderToString(<Root />, opts);
}
`;

  const DEFAULT_ROOT = `
import App from './app';

export const Root = () => {
  return (
    <>
      <head>
        <title>Tutorial</title>
      </head>
      <body>
        <App />
      </body>
    </>
  );
};
`;

  if (!files.some((i) => i.code === '/root.tsx')) {
    files.push({ path: '/root.tsx', code: DEFAULT_ROOT, hidden: true });
  }

  if (!files.some((i) => i.code === '/entry.server.tsx')) {
    files.push({ path: '/entry.server.tsx', code: DEFAULT_ENTRY_SERVER, hidden: true });
  }

  return files;
};

export interface TutorialStore extends ReplAppInput {
  appId: string;
  app: TutorialApp;
  prev: TutorialApp | undefined;
  next: TutorialApp | undefined;
  isShowingSolution: boolean;
}

export const PANELS = ['Tutorial', 'Input', 'Output'];
export const onGet: RequestHandler = ({ cacheControl, headers }) => {
  cacheControl({
    public: true,
    maxAge: 3600,
  });
  setReplCorsHeaders(headers);
};
