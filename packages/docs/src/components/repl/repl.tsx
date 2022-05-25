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
import type { ReplStore, ReplUpdateMessage, ReplMessage, ReplAppInput } from './types';
import { ReplDetailPanel } from './repl-detail-panel';
import { getReplVersion } from './repl-version';
import { updateReplOutput } from './repl-output-update';

export const Repl = component$(async (props: ReplProps) => {
  useScopedStyles$(styles);

  const input = props.input;

  const store = useStore(() => {
    const initStore: ReplStore = {
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
      versions: [],
      events: [],
    };
    return initStore;
  });

  useWatch$((track) => {
    track(input, 'files');

    if (!input.files.some((i) => i.path === props.selectedInputPath) && input.files.length > 0) {
      store.selectedInputPath = input.files[0].path;
    }
  });

  const onInputChange = $((path: string, code: string) => {
    const file = input.files.find((i) => i.path === path);
    if (file) {
      file.code = code;
      input.buildId++;
    }
  });

  const onInputDelete = $((path: string) => {
    input.files = input.files.filter((i) => i.path !== path);
    if (store.selectedInputPath === path) {
      if (input.files.length > 0) {
        store.selectedInputPath = input.files[0].path;
      } else {
        store.selectedInputPath = '';
      }
    }
  });

  useClientEffect$(async () => {
    // only run on the client
    const v = await getReplVersion(input.version);

    if (v.version) {
      let serverUrl = `/repl/repl-server`;

      if (location.hostname === 'localhost') {
        serverUrl += `.html`;
      }
      serverUrl += `#${store.clientId}`;

      store.versions = v.versions;
      input.version = v.version;
      store.serverUrl = serverUrl;

      window.addEventListener('message', (ev) => receiveMessageFromReplServer(ev, store));
    }
  });

  useWatch$((track) => {
    track(input, 'buildId');
    track(input, 'buildMode');
    track(input, 'entryStrategy');
    track(input, 'files');
    track(input, 'version');
    track(store, 'serverWindow');

    sendUserUpdateToReplServer(input, store);
  });

  return (
    <Host class="repl">
      <ReplInputPanel
        input={input}
        store={store}
        onInputChangeQrl={onInputChange}
        onInputDeleteQrl={onInputDelete}
      />
      <ReplOutputPanel input={input} store={store} />
      <ReplDetailPanel input={input} store={store} />
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

export const sendUserUpdateToReplServer = (input: ReplAppInput, store: ReplStore) => {
  if (input.version && store.serverWindow) {
    const msg: ReplUpdateMessage = {
      type: 'update',
      clientId: store.clientId,
      options: {
        buildId: input.buildId,
        debug: store.debug,
        srcInputs: input.files,
        buildMode: input.buildMode as any,
        entryStrategy: {
          type: input.entryStrategy as any,
        },
        version: input.version,
      },
    };

    if (msg.options.srcInputs && msg.options.srcInputs.length > 0) {
      // using JSON.stringify() to remove proxies
      store.serverWindow.postMessage(JSON.stringify(msg));
    }
  }
};

export interface ReplProps {
  input: ReplAppInput;
  selectedInputPath?: string;
  enableHtmlOutput?: boolean;
  enableClientOutput?: boolean;
  enableSsrOutput?: boolean;
}
