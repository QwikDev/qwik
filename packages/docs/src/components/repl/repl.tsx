import {
  component$,
  Host,
  noSerialize,
  useScopedStyles$,
  useStore,
  useEffect$,
  useClientEffect$,
} from '@builder.io/qwik';
import { isBrowser } from '@builder.io/qwik/build';
import { ReplInputPanel } from './repl-input-panel';
import { ReplOutputPanel } from './repl-output-panel';
import styles from './repl.css?inline';
import type { ReplStore, ReplResult, ReplModuleInput, ReplMessageEvent } from './types';
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
    lastOutputPanel: null,
    selectedOutputDetail: 'options',
    selectedClientModule: '',
    selectedSsrModule: '',
    entryStrategy: 'hook',
    buildMode: 'development',
    ssrBuild: true,
    debug: false,
    iframeUrl: 'about:blank',
    iframeWindow: null,
    version: props.version,
    versions: [],
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
      postReplInputUpdate(store);
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
    postReplInputUpdate(store);
  };

  useClientEffect$(async () => {
    let data: NpmData = JSON.parse(sessionStorage.getItem('qwikNpmData')!);
    if (!data) {
      const npmData = `https://data.jsdelivr.com/v1/package/npm/@builder.io/qwik`;
      const npmRsp = await fetch(npmData);
      data = await npmRsp.json();
      sessionStorage.setItem('qwikNpmData', JSON.stringify(data));
    }

    store.versions = data.versions.filter(
      (v) => !v.includes('-dev') && parseInt(v.split('.')[2]) >= 19
    );
    if (!store.version || !data.versions.includes(store.version)) {
      store.version = data.tags.latest;
    }
  });

  useEffect$(() => {
    if (isBrowser) {
      store.iframeUrl = '/repl/index.html';
      if (location.hostname === 'qwik.builder.io') {
        // use a different domain on purpose
        store.iframeUrl = 'https://qwik-docs.pages.dev' + store.iframeUrl;
      }

      // how do I not use window event listener here?
      window.addEventListener('message', (ev) => onMessageFromIframe(ev, store));
    }
  });

  useEffect$((track) => {
    track(store, 'entryStrategy');
    track(store, 'buildMode');
    track(store, 'version');

    postReplInputUpdate(store);
  });

  return (
    <Host class="repl">
      <ReplInputPanel store={store} onInputChange={onInputChange} onInputDelete={onInputDelete} />
      <ReplOutputPanel store={store} />
      <ReplDetailPanel store={store} />
    </Host>
  );
});

export const updateReplOutput = (store: ReplStore, result: ReplResult) => {
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
    store.lastOutputPanel = store.selectedOutputPanel;
    store.selectedOutputPanel = 'diagnostics';
  } else if (result.diagnostics.length === 0 && store.selectedOutputPanel === 'diagnostics') {
    store.selectedOutputPanel = store.lastOutputPanel || 'app';
  }
};

export const onMessageFromIframe = (ev: MessageEvent, store: ReplStore) => {
  switch (ev.data?.type) {
    case 'replready': {
      store.iframeWindow = noSerialize(ev.source as any);
      postReplInputUpdate(store);
      break;
    }
    case 'result': {
      updateReplOutput(store, ev.data);
      break;
    }
  }
};

export const postReplInputUpdate = (store: ReplStore) => {
  if (store.version) {
    const msg: ReplMessageEvent = {
      type: 'update',
      options: {
        debug: store.debug,
        srcInputs: store.inputs,
        buildMode: store.buildMode,
        entryStrategy: {
          type: store.entryStrategy as any,
        },
        version: store.version,
      },
    };

    if (store.iframeWindow && msg.options.srcInputs.length > 0) {
      store.iframeWindow.postMessage(JSON.stringify(msg));
    }
  }
};

export interface ReplProps {
  inputs?: ReplModuleInput[];
  selectedInputPath?: string;
  enableHtmlOutput?: boolean;
  enableClientOutput?: boolean;
  enableSsrOutput?: boolean;
  version?: string;
}

// https://data.jsdelivr.com/v1/package/npm/@builder.io/qwik
interface NpmData {
  tags: { latest: string };
  versions: string[];
}
