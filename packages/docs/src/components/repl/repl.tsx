import {
  component$,
  Host,
  noSerialize,
  useScopedStyles$,
  useStore,
  useWatch$,
  useClientEffect$,
  $,
} from '@builder.io/qwik';
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

  const onInputChange = $((path: string, code: string) => {
    const input = store.inputs.find((i) => i.path === path);
    if (input) {
      input.code = code;
      store.inputs = [...store.inputs];
    }
  });

  const onInputDelete = $((path: string) => {
    store.inputs = store.inputs.filter((i) => i.path !== path);
    if (store.selectedInputPath === path) {
      if (store.inputs.length > 0) {
        store.selectedInputPath = store.inputs[0].path;
      } else {
        store.selectedInputPath = '';
      }
    }
  });

  useClientEffect$(async () => {
    let data: NpmData = JSON.parse(sessionStorage.getItem('qwikNpmData')!);
    if (!data) {
      const npmData = `https://data.jsdelivr.com/v1/package/npm/@builder.io/qwik`;
      const npmRsp = await fetch(npmData);
      data = await npmRsp.json();
      sessionStorage.setItem('qwikNpmData', JSON.stringify(data));
    }

    store.versions = data.versions.filter(
      (v) => !v.includes('-') && parseInt(v.split('.')[2]) >= 19
    );
    if (!store.version || !data.versions.includes(store.version)) {
      store.version = data.tags.latest;
    }

    store.iframeUrl = '/repl/';
    if (location.hostname === 'localhost') {
      store.iframeUrl += 'index.html';
    }

    // TODO: enable when this ships
    // https://github.com/BuilderIO/qwik/commit/9fb3b9b72593c76fd80a5739a77adefd88a07651
    // if (location.hostname === 'qwik.builder.io') {
    //   // use a different domain on purpose
    //   store.iframeUrl = 'https://qwik-docs.pages.dev' + store.iframeUrl;
    // }

    // how do I not use window event listener here?
    window.addEventListener('message', (ev) => onMessageFromIframe(ev, store));
  });

  useWatch$((track) => {
    track(store, 'entryStrategy');
    track(store, 'buildMode');
    track(store, 'inputs');
    track(store, 'version');
    track(store, 'iframeWindow');

    postReplInputUpdate(store);
  });

  return (
    <Host class="repl">
      <ReplInputPanel
        store={store}
        onInputChangeQrl={onInputChange}
        onInputDeleteQrl={onInputDelete}
      />
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
      break;
    }
    case 'result': {
      updateReplOutput(store, ev.data);
      break;
    }
  }
};

export const postReplInputUpdate = (store: ReplStore) => {
  if (store.version && store.iframeWindow) {
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

    if (msg.options.srcInputs.length > 0) {
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
