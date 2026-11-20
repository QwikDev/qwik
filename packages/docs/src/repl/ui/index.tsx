import {
  component$,
  noSerialize,
  useStyles$,
  useStore,
  useTask$,
  useVisibleTask$,
  $,
  useOnWindow,
} from '@qwik.dev/core';
import { ReplInputPanel } from './repl-input-panel';
import { ReplOutputPanel } from './repl-output-panel';
import styles from './repl.css?inline';
import type { ReplStore, ReplAppInput } from '../types';
import { ReplDetailPanel } from './repl-detail-panel';
import { getReplVersion, resolveReplVersion } from './repl-version';
import { ReplInstance } from '../repl-instance';
import { ReplMainResizer } from './repl-main-resizer';

export const Repl = component$((props: ReplProps) => {
  useStyles$(styles);

  const input = props.input;

  const store = useStore(() => {
    const initStore: ReplStore = {
      replId: Math.round(Math.random() * Number.MAX_SAFE_INTEGER)
        .toString(36)
        .toLowerCase(),
      html: '',
      transformedModules: [],
      clientBundles: [],
      ssrModules: [],
      diagnostics: [],
      monacoDiagnostics: [],
      enableClientOutput: props.enableClientOutput !== false,
      enableHtmlOutput: props.enableHtmlOutput !== false,
      enableSsrOutput: props.enableSsrOutput !== false,
      selectedInputPath: '',
      selectedOutputPanel: 'app',
      selectedOutputDetail: 'console',
      ssrBuild: true,
      debug: false,
      versions: [],
      events: [],
      isLoading: true,
      instance: null,
      reload: 0,
    };
    return initStore;
  });

  useTask$(({ track }) => {
    track(() => input.files);

    if (!input.files.some((i) => i.path === props.selectedInputPath) && input.files.length > 0) {
      store.selectedInputPath = input.files[0].path;
    }
  });

  const onInputChange$ = $((path: string, code: string) => {
    const file = input.files.find((i) => i.path === path);
    if (file) {
      file.code = code;

      store.instance!.markDirty();
    }
  });

  const onInputDelete$ = $((path: string) => {
    input.files = input.files.filter((i) => i.path !== path);
    if (store.selectedInputPath === path) {
      if (input.files.length > 0) {
        store.selectedInputPath = input.files[0].path;
      } else {
        store.selectedInputPath = '';
      }
    }
  });

  // Initialize the REPL instance
  useVisibleTask$(
    async () => {
      (store as any).instance = noSerialize(new ReplInstance(store, input));

      const v = await resolveReplVersion(input.version);
      store.versions = v.versions;
      const version = v.version;
      if (input.version === version) {
        store.instance!.markDirty();
      } else {
        // The input tracker below requests the build; asking here too can build twice.
        input.version = version;
      }

      // Refresh the version list from the network.
      store.versions = (await getReplVersion(input.version, false)).versions;
    },
    { strategy: 'document-ready' }
  );

  // Track input changes to rebuild the app
  useVisibleTask$(({ track }) => {
    track(input);

    store.instance?.markDirty();
  });

  // Messages from ../bundler/client-events-listener.ts
  useOnWindow(
    'message',
    $((event: MessageEvent) => {
      if (
        event.data &&
        event.data.type === 'event' &&
        event.data.replId === store.replId &&
        event.data.event
      ) {
        store.events.push(event.data.event);
      }
    })
  );

  return (
    <>
      <ReplInputPanel
        input={input}
        store={store}
        onInputChange$={onInputChange$}
        onInputDelete$={onInputDelete$}
        enableCopyToPlayground={props.enableCopyToPlayground}
        enableDownload={props.enableDownload}
        enableInputDelete={props.enableInputDelete}
        editorTheme={props.editorTheme}
      />
      {props.enableMainSplitter ? <ReplMainResizer /> : null}
      <ReplOutputPanel input={input} store={store} />
      <ReplDetailPanel input={input} store={store} />
    </>
  );
});

export interface ReplProps {
  /** This has to be a Store, we keep a reference to it */
  input: ReplAppInput;
  selectedInputPath?: string;
  enableHtmlOutput?: boolean;
  enableClientOutput?: boolean;
  enableSsrOutput?: boolean;
  enableInputDelete?: boolean;
  enableDownload?: boolean;
  enableCopyToPlayground?: boolean;
  enableMainSplitter?: boolean;
  editorTheme?: import('./monaco').EditorThemeName;
}
