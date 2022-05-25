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
import type { ReplStore, ReplModuleInput, ReplUpdateMessage, ReplMessage } from './types';
import { ReplDetailPanel } from './repl-detail-panel';
import { getReplVersion } from './repl-version';
import { updateReplOutput } from './repl-output-update';

export const Repl = component$(async (props: ReplProps) => {
  useScopedStyles$(styles);

  const store = useStore<ReplStore>(() => ({
    clientId: Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36),
    html: '',
    clientModules: [],
    ssrModules: [],
    diagnostics: [],
    monacoDiagnostics: [],
    enableClientOutput: props.enableClientOutput !== false,
    enableHtmlOutput: props.enableHtmlOutput !== false,
    enableSsrOutput: props.enableSsrOutput !== false,
    enableConsole: true,
    selectedInputPath: '',
    selectedOutputPanel: 'app',
    selectedOutputDetail: 'console',
    selectedClientModule: '',
    selectedSsrModule: '',
    ssrBuild: true,
    debug: false,
    serverUrl: 'about:blank',
    serverWindow: null,
    version: props.version,
    entryStrategy: props.entryStrategy || 'hook',
    buildMode: props.buildMode || 'development',
    versions: [],
    build: 0,
    events: [],
  }));

  useWatch$(async (track) => {
    track(props, 'inputs');

    if (!props.inputs.some((i) => i.path === props.selectedInputPath)) {
      store.selectedInputPath = props.inputs[0].path;
    }
  });

  const onInputChange = $((path: string, code: string) => {
    const input = props.inputs.find((i) => i.path === path);
    if (input) {
      input.code = code;
      store.build++;
    }
  });

  const onInputDelete = $((path: string) => {
    props.inputs = props.inputs.filter((i) => i.path !== path);
    if (store.selectedInputPath === path) {
      if (props.inputs.length > 0) {
        store.selectedInputPath = props.inputs[0].path;
      } else {
        store.selectedInputPath = '';
      }
    }
  });

  useClientEffect$(async () => {
    // only run on the client
    const v = await getReplVersion(store.version);

    if (v.version) {
      let serverUrl = `/repl/repl-server`;

      if (location.hostname === 'localhost') {
        serverUrl += `.html`;
      }
      serverUrl += `#${store.clientId}`;

      store.versions = v.versions;
      store.version = v.version;
      store.serverUrl = serverUrl;

      window.addEventListener('message', (ev) => receiveMessageFromReplServer(ev, store));
    }
  });

  useWatch$((track) => {
    track(store, 'entryStrategy');
    track(store, 'buildMode');
    track(props, 'inputs');
    track(store, 'version');
    track(store, 'serverWindow');
    track(store, 'build');
    sendUserUpdateToReplServer(store, props.inputs);
  });

  return (
    <Host class="repl">
      <ReplInputPanel
        inputs={props.inputs}
        store={store}
        onInputChangeQrl={onInputChange}
        onInputDeleteQrl={onInputDelete}
      />
      <ReplOutputPanel store={store} />
      <ReplDetailPanel store={store} />
    </Host>
  );
});

export const receiveMessageFromReplServer = (ev: MessageEvent, store: ReplStore) => {
  const msg: ReplMessage = ev.data;
  const type = msg?.type;
  const clientId = msg?.clientId;
  if (clientId === store.clientId) {
    if (type === 'replready') {
      // keep a reference to the repl server window
      store.serverWindow = noSerialize(ev.source as any);
    } else if (type === 'result') {
      // received a message from the server
      updateReplOutput(store, msg);
    } else if (type === 'event') {
      // received an event from the user's app
      store.events.push(msg.event);
    }
  }
};

export const sendUserUpdateToReplServer = (store: ReplStore, inputs: ReplModuleInput[]) => {
  if (store.version && store.serverWindow) {
    const msg: ReplUpdateMessage = {
      type: 'update',
      clientId: store.clientId,
      options: {
        buildId: String(store.build),
        debug: store.debug,
        srcInputs: inputs,
        buildMode: store.buildMode,
        entryStrategy: {
          type: store.entryStrategy as any,
        },
        version: store.version,
      },
    };

    if (msg.options.srcInputs.length > 0) {
      // using JSON.stringify() to remove proxies
      store.serverWindow.postMessage(JSON.stringify(msg));
    }
  }
};

export interface ReplProps {
  inputs: ReplModuleInput[];
  selectedInputPath?: string;
  enableHtmlOutput?: boolean;
  enableClientOutput?: boolean;
  enableSsrOutput?: boolean;
  version?: string;
  entryStrategy?: string;
  buildMode?: 'development' | 'production';
}
