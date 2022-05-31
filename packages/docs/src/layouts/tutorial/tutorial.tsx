import { component$, Host, Slot, useScopedStyles$, useStore, useStyles$ } from '@builder.io/qwik';
import { useLocation } from '../../utils/useLocation';
import { Repl } from '../../components/repl/repl';
import styles from './tutorial.css?inline';
import { TutorialContentFooter } from './tutorial-content-footer';
import { TutorialContentHeader } from './tutorial-content-header';
import tutorialSections, { TutorialApp } from '@tutorial-data';
import { Header } from '../../components/header/header';
import type { ReplAppInput, ReplModuleInput } from '../../components/repl/types';

const Tutorial = component$(() => {
  useScopedStyles$(styles);
  useStyles$(`html,body { margin: 0; height: 100%; overflow: hidden; }`);

  const loc = useLocation();
  const getTutorialApp = (): TutorialApp | undefined => {
    for (const s of tutorialSections) {
      for (const t of s.apps) {
        if (`/tutorial/${t.id}` === loc.pathname) {
          return t;
        }
      }
    }
  };

  const current = getTutorialApp();
  if (!current) {
    return <p>Unable to find tutorial "{loc.pathname}"</p>;
  }

  const store = useStore<TutorialStore>(() => {
    const files: ReplModuleInput[] = JSON.parse(JSON.stringify(current.problemInputs));

    if (!files.some((i) => i.code === '/root.tsx')) {
      files.push({ path: '/root.tsx', code: DEFAULT_ROOT, hidden: true });
    }

    if (!files.some((i) => i.code === '/entry.server.tsx')) {
      files.push({ path: '/entry.server.tsx', code: DEFAULT_ENTRY_SERVER, hidden: true });
    }

    const initStore: TutorialStore = {
      buildId: 0,
      files,
      version: '',
      buildMode: 'development',
      entryStrategy: 'hook',
    };
    return initStore;
  });

  const tutorials: TutorialApp[] = [];
  tutorialSections.forEach((s) => tutorials.push(...s.apps));

  const currentIndex = tutorials.findIndex((i) => i.id === current.id);
  const prev = tutorials[currentIndex - 1];
  const next = tutorials[currentIndex + 1];

  return (
    <Host class="full-width tutorial">
      <Header />
      <main>
        <div class="tutorial-content-panel">
          <TutorialContentHeader current={current} />
          <div class="content-main">
            <div>
              <Slot />
              {next ? (
                <div class="next-link">
                  <a href={`/tutorial/${next.id}`} class="next">
                    Next: {next.title}
                  </a>
                </div>
              ) : null}
            </div>
          </div>
          <TutorialContentFooter current={current} next={next} prev={prev} />
        </div>
        <div class="tutorial-repl-panel">
          <Repl
            input={store}
            enableHtmlOutput={current.enableHtmlOutput}
            enableClientOutput={current.enableClientOutput}
            enableSsrOutput={current.enableSsrOutput}
            enableCopyToPlayground={true}
            enableDownload={true}
            enableInputDelete={false}
          />
          <div class="tutorial-repl-footer" />
        </div>
      </main>
    </Host>
  );
});

interface TutorialStore extends ReplAppInput {}

export const DEFAULT_ENTRY_SERVER = `
import { renderToString, RenderToStringOptions } from '@builder.io/qwik/server';
import { Root } from './root';

export function render(opts: RenderToStringOptions) {
  return renderToString(<Root />, opts);
}
`;

export const DEFAULT_ROOT = `
import { App } from './app';

export const Root = () => {
  return (
    <html>
      <head>
        <title>Tutorial</title>
      </head>
      <body>
        <App />
      </body>
    </html>
  );
};
`;

export default Tutorial;
