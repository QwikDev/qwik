import {
  component$,
  Host,
  noSerialize,
  useScopedStyles$,
  useStore,
  useWatch$,
  useWatchEffect$,
} from '@builder.io/qwik';
import { isBrowser } from '@builder.io/qwik/build';
import { ReplInputPanel } from './repl-input-panel';
import { ReplOutputPanel } from './repl-output-panel';
import styles from './repl.css?inline';
import type {
  ReplInputOptions,
  ReplStore,
  ReplResult,
  ReplModuleInput,
  ReplMessageEvent,
} from './types';
import { ReplDetailPanel } from './repl-detail-panel';

export const Repl = component$(async (props: ReplProps) => {
  useScopedStyles$(styles);

  const store = useStore<ReplStore>({
    inputs: props.inputs || [],
    outputHtml: '',
    clientModules: [],
    ssrModules: [],
    diagnostics: [],
    enableClientOutput: props.enableClientOutput !== false,
    enableHtmlOutput: props.enableHtmlOutput !== false,
    enableSsrOutput: props.enableSsrOutput !== false,
    selectedInputPath: '',
    selectedOutputPanel: 'app',
    selectedOutputDetail: 'options',
    selectedClientModule: '',
    selectedSsrModule: '',
    minify: 'none',
    entryStrategy: 'single',
    ssrBuild: true,
    debug: false,
    iframeUrl: 'about:blank',
    iframeWindow: null,
    version: props.version || '0.0.19-1',
  });

  if (!store.selectedInputPath) {
    if (store.inputs.some((i) => i.path === props.selectedInputPath)) {
      store.selectedInputPath = props.selectedInputPath!;
    } else if (store.inputs.length > 0) {
      store.selectedInputPath = store.inputs[0].path;
    }
  }

  const onInputChange = (path: string, code: string) => {
    const input = store.inputs.find((i) => i.path === path);
    if (input) {
      input.code = code;
      postReplInputUpdate();
    }
  };

  const onInputDelete = (path: string) => {
    store.inputs = store.inputs.filter((i) => i.path !== path);
    if (store.selectedInputPath === path) {
      if (store.inputs.length > 0) {
        store.selectedInputPath = store.inputs[0].path;
      } else {
        store.selectedInputPath = '';
      }
    }
    postReplInputUpdate();
  };

  const postReplInputUpdate = () => {
    const opts: ReplInputOptions = {
      debug: store.debug,
      srcInputs: store.inputs,
      minify: store.minify,
      entryStrategy: {
        type: store.entryStrategy as any,
      },
    };

    const replMsg: ReplMessageEvent = {
      type: 'update',
      version: store.version,
      options: opts,
    };

    if (store.iframeWindow && opts.srcInputs.length > 0) {
      store.iframeWindow.postMessage(JSON.stringify(replMsg));
    }
  };

  const updateReplOutput = (result: ReplResult) => {
    store.outputHtml = result.outputHtml;
    store.clientModules = result.clientModules;
    store.ssrModules = result.ssrModules;
    store.diagnostics = result.diagnostics;

    if (!result.clientModules.some((m) => m.path === store.selectedClientModule)) {
      if (result.clientModules.length > 0) {
        store.selectedClientModule = result.clientModules[0].path;
      } else {
        store.selectedClientModule = '';
      }
    }

    if (!result.ssrModules.some((m) => m.path === store.selectedSsrModule)) {
      if (result.ssrModules.length > 0) {
        store.selectedSsrModule = result.ssrModules[0].path;
      } else {
        store.selectedSsrModule = '';
      }
    }

    if (result.diagnostics.length > 0) {
      store.selectedOutputPanel = 'diagnostics';
    } else if (result.diagnostics.length === 0 && store.selectedOutputPanel === 'diagnostics') {
      store.selectedOutputPanel = 'app';
    }
  };

  const onMessageFromIframe = (ev: MessageEvent) => {
    switch (ev.data?.type) {
      case 'replready': {
        store.iframeWindow = noSerialize(ev.source as any);
        postReplInputUpdate();
        break;
      }
      case 'result': {
        updateReplOutput(ev.data);
        break;
      }
    }
  };

  useWatchEffect$(() => {
    // is this right for is browser only?
    if (isBrowser) {
      store.iframeUrl = '/repl/index.html';
      if (location.hostname === 'qwik.builder.io') {
        // use a different domain on purpose
        store.iframeUrl = 'https://qwik-docs.pages.dev' + store.iframeUrl;
      }

      // how do I not use window event listener here?
      window.addEventListener('message', onMessageFromIframe);
    }
  });

  useWatch$((track) => {
    track(store, 'entryStrategy');
    track(store, 'minify');
    track(store, 'version');

    postReplInputUpdate();
  });

  return (
    <Host class="repl">
      <ReplInputPanel store={store} onInputChange={onInputChange} onInputDelete={onInputDelete} />
      <ReplOutputPanel store={store} />
      <ReplDetailPanel store={store} />
    </Host>
  );
});

export interface ReplProps {
  inputs?: ReplModuleInput[];
  selectedInputPath?: string;
  enableHtmlOutput?: boolean;
  enableClientOutput?: boolean;
  enableSsrOutput?: boolean;
  version?: string;
}
