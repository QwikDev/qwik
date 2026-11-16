import exampleSections, { type ExampleApp } from '@examples-data';
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
import { useLocation, type DocumentHead, type RequestHandler } from '@qwik.dev/router';
import type { ReplAppInput } from '~/repl/types';
import { setReplCorsHeaders } from '~/utils/utils';
import { Header } from '../../components/header/header';
import { PanelToggle } from '../../components/panel-toggle/panel-toggle';
import { Repl } from '../../repl/ui';
import { createPlaygroundShareUrl, parsePlaygroundShareUrl } from '../../repl/ui/repl-share-url';
import styles from './playground.css?inline';

const DEFAULT_EXAMPLE_ID = 'hello-world';

const getExample = (id: string | null): ExampleApp => {
  const apps = exampleSections.flatMap((section) => section.apps);
  return apps.find((app) => app.id === id) || apps.find((app) => app.id === DEFAULT_EXAMPLE_ID)!;
};

const getExampleUrl = (id: string) =>
  id === DEFAULT_EXAMPLE_ID ? '/playground/' : `/playground/?example=${id}`;

// The editor mutates the files, so never hand it the shared example data.
const copyExampleFiles = (example: ExampleApp) => example.inputs.map((file) => ({ ...file }));

interface PlaygroundStore extends ReplAppInput {
  exampleId: string;
}

export default component$(() => {
  useStyles$(styles);
  const loc = useLocation();
  const shareUrlTmr = useSignal<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isExamplesCollapsed = useSignal(false);

  const store = useStore<PlaygroundStore>(() => {
    const example = getExample(loc.url.searchParams.get('example'));
    return {
      exampleId: example.id,
      files: copyExampleFiles(example),
      version: '',
      buildMode: 'development',
      entryStrategy: 'segment',
      outOfOrderStreaming: true,
    };
  });

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
      store.outOfOrderStreaming = shareData.outOfOrderStreaming;
      if (shareData.files.length > 0) {
        store.files = shareData.files;
      }
    }
  });

  useTask$(({ track }) => {
    track(() => store.buildMode);
    track(() => store.entryStrategy);
    track(() => store.outOfOrderStreaming);
    track(() => store.version);
    track(() => store.files.forEach((f) => f.code));

    if (isBrowser) {
      if (store.version) {
        clearTimeout(shareUrlTmr.value);

        shareUrlTmr.value = setTimeout(() => {
          const shareUrl = createPlaygroundShareUrl(
            store,
            getExampleUrl(store.exampleId),
            getExample(store.exampleId).inputs
          );
          history.replaceState({}, '', shareUrl);
        }, 1000);
      }
    }
  });

  const selectExample = $((id: string) => {
    const example = getExample(id);
    store.exampleId = example.id;
    store.files = copyExampleFiles(example);
    panelStore.active = 'Input';
    document.title = `${example.title} - Qwik`;
    history.replaceState({}, '', getExampleUrl(example.id));
  });

  return (
    <div
      class={{
        playground: true,
        'full-width': true,
        'fixed-header': true,
        'repl-theme-docs': true,
        'playground-examples-collapsed': isExamplesCollapsed.value,
      }}
    >
      <Header />
      <PanelToggle panelStore={panelStore} />
      <main class="playground-main">
        <nav id="playground-examples" class="playground-examples" aria-label="Examples">
          {exampleSections.map((section) => (
            <section key={section.id} class="playground-examples-section">
              <h2>{section.title}</h2>
              {section.apps.map((app) => (
                <a
                  key={app.id}
                  href={getExampleUrl(app.id)}
                  preventdefault:click
                  onClick$={() => selectExample(app.id)}
                  aria-current={store.exampleId === app.id ? 'page' : undefined}
                  class={{
                    'example-button': true,
                    selected: store.exampleId === app.id,
                  }}
                >
                  <div class="example-button-icon">{app.icon}</div>
                  <div class="example-button-content">
                    <h3>{app.title}</h3>
                    <p>{app.description}</p>
                  </div>
                </a>
              ))}
            </section>
          ))}
          <a
            href="https://github.com/QwikDev/qwik/tree/main/packages/docs/src/routes/playground/examples/"
            class="example-button-new"
            target="_blank"
          >
            👏 Add new examples
          </a>
        </nav>

        <div class="playground-workspace">
          <div class="playground-toolbar">
            <button
              type="button"
              class="playground-examples-toggle"
              aria-controls="playground-examples"
              aria-expanded={!isExamplesCollapsed.value}
              onClick$={() => (isExamplesCollapsed.value = !isExamplesCollapsed.value)}
            >
              {isExamplesCollapsed.value ? 'Show examples' : 'Hide examples'}
            </button>
            <select
              class="playground-examples-select"
              aria-label="Choose an example"
              onChange$={(_, select) => selectExample(select.value)}
            >
              {exampleSections.map((section) => (
                <optgroup key={section.id} label={section.title}>
                  {section.apps.map((app) => (
                    <option key={app.id} value={app.id} selected={store.exampleId === app.id}>
                      {`${app.icon} ${app.title}`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div
            class={{
              repl: true,
              'repl-mobile-paged': true,
              'repl-mobile-paged-3': true,
              'repl-mobile-panel-output': panelStore.active === 'Output',
              'repl-mobile-panel-console': panelStore.active === 'Console',
            }}
          >
            <Repl
              input={store}
              enableCopyToPlayground={false}
              enableDownload={true}
              enableInputDelete={true}
              enableMainSplitter={true}
              editorTheme="github-light"
            />
          </div>
        </div>
      </main>
    </div>
  );
});

export const head: DocumentHead = ({ url }) => {
  const exampleId = url.searchParams.get('example');
  return {
    title: exampleId ? getExample(exampleId).title : 'Playground',
  };
};

export const onGet: RequestHandler = ({ cacheControl, headers }) => {
  cacheControl({
    public: true,
    maxAge: 3600,
  });

  setReplCorsHeaders(headers);
};
