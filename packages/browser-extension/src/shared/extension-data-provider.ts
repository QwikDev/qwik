import type {
  Component,
  PageDataSource,
  QwikDevtoolsComponentSnapshot,
  QwikDevtoolsHookExtended,
  QwikDevtoolsSignalsSnapshot,
  QwikPerfStoreRemembered,
  QwikPreloadStoreRemembered,
} from '@qwik.dev/devtools/kit';
import { DEVTOOLS_MESSAGES, QWIK_DEVTOOLS_GLOBAL } from '@qwik.dev/devtools/kit';
import type { ComponentDetailEntry, ExtensionMessage, RenderEvent, VNodeTreeNode } from './types';
import { isExtensionMessage } from './types';

type DevtoolsPort = chrome.runtime.Port & {
  postMessage(message: ExtensionMessage): void;
};

interface DevtoolsStateLike {
  components: Component[];
  npmPackages: [string, string][];
  assets: unknown[];
  allDependencies: unknown[];
  isLoadingDependencies: boolean;
  vitePluginDetected?: boolean;
}

const SCRIPT_SETTLE_MS = 50;
const PAGE_DEVTOOLS_ROOT = `window[${JSON.stringify(QWIK_DEVTOOLS_GLOBAL.key)}]`;
const PAGE_DEVTOOLS_HOOK = `${PAGE_DEVTOOLS_ROOT}?.[${JSON.stringify(
  QWIK_DEVTOOLS_GLOBAL.props.hook
)}]`;
const PAGE_DEVTOOLS_PERF = `${PAGE_DEVTOOLS_ROOT}?.[${JSON.stringify(
  QWIK_DEVTOOLS_GLOBAL.props.perf
)}]`;
const PAGE_DEVTOOLS_PRELOADS = `${PAGE_DEVTOOLS_ROOT}?.[${JSON.stringify(
  QWIK_DEVTOOLS_GLOBAL.props.preloads
)}]`;

function getDevtoolsPort(): DevtoolsPort | null {
  const port = (window as unknown as { __devtools_port?: DevtoolsPort }).__devtools_port;
  return port ?? null;
}

function toLiteral(value: unknown): string {
  return JSON.stringify(value ?? null);
}

type HookMethod = keyof QwikDevtoolsHookExtended;

// Type-checked hook method name, so a typo or rename is a compile error, not a silent no-op.
function hookCall(method: HookMethod, ...args: unknown[]): string {
  return `${PAGE_DEVTOOLS_HOOK}?.${method}?.(${args.map(toLiteral).join(', ')})`;
}

/** Reads and JSON-parses the result of a page-side hook method call. */
function readHookJson<T>(method: HookMethod, ...args: unknown[]): Promise<T | null> {
  return readJsonFromPage<T>(hookCall(method, ...args));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function evalInPage<T>(expression: string): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval(expression, (result, exceptionInfo) => {
      if (exceptionInfo) {
        resolve(null);
        return;
      }
      resolve((result as T) ?? null);
    });
  });
}

async function readJsonFromPage<T>(expression: string): Promise<T | null> {
  const json = await evalInPage<string | null>(`(() => {
    try {
      const value = (${expression});
      return value == null ? null : JSON.stringify(value);
    } catch (_) {
      return null;
    }
  })()`);

  if (!json) {
    return null;
  }

  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

async function injectPageScript(path: string, readyExpression: string): Promise<void> {
  const src = chrome.runtime.getURL(path);
  await evalInPage<boolean>(`(() => {
    try {
      if (${readyExpression}) {
        return true;
      }
      const script = document.createElement('script');
      script.src = ${JSON.stringify(src)};
      script.onload = () => script.remove();
      (document.documentElement || document.head).appendChild(script);
      return true;
    } catch (_) {
      return false;
    }
  })()`);
  await delay(SCRIPT_SETTLE_MS);
}

async function ensurePageHooks(): Promise<void> {
  await injectPageScript('/devtools-hook.js', `!!${PAGE_DEVTOOLS_HOOK}`);
  await injectPageScript('/vnode-bridge.js', `!!${PAGE_DEVTOOLS_HOOK}?.getVNodeTree`);
}

function requestContentMessage<T extends ExtensionMessage>(
  message: ExtensionMessage,
  expectedType: T['type'],
  timeoutMs = 1000
): Promise<T | null> {
  const port = getDevtoolsPort();
  if (!port?.onMessage) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      port.onMessage.removeListener(handler);
      resolve(null);
    }, timeoutMs);

    const handler = (response: unknown) => {
      if (!isExtensionMessage(response) || response.type !== expectedType) {
        return;
      }
      window.clearTimeout(timeout);
      port.onMessage.removeListener(handler);
      resolve(response as T);
    };

    port.onMessage.addListener(handler);
    port.postMessage(message);
  });
}

function toComponent(snapshot: QwikDevtoolsComponentSnapshot): Component {
  const file = snapshot.path;
  const fileName = file.split('/').pop() ?? file;
  return {
    name: snapshot.name,
    fileName,
    file,
  };
}

export function createExtensionDataProvider() {
  return {
    async loadData(state: DevtoolsStateLike) {
      state.isLoadingDependencies = true;

      const detection = await requestContentMessage<
        Extract<ExtensionMessage, { type: 'QWIK_DETECTION_RESULT' }>
      >({ type: 'DETECT_QWIK' }, 'QWIK_DETECTION_RESULT');

      await ensurePageHooks();

      const [components, vitePluginDetected] = await Promise.all([
        createRemotePageDataSource().readComponentTree(),
        evalInPage<boolean>(`!!${PAGE_DEVTOOLS_HOOK}`),
      ]);

      state.components = (components ?? []).map(toComponent);
      state.assets = [];
      state.allDependencies = [];
      state.vitePluginDetected = vitePluginDetected ?? false;
      state.npmPackages = detection?.payload.version
        ? [['@qwik.dev/core', detection.payload.version]]
        : [];
      state.isLoadingDependencies = false;
    },
  };
}

export function createRemotePageDataSource(): PageDataSource {
  return {
    async readPerfData(): Promise<QwikPerfStoreRemembered | null> {
      return readJsonFromPage<QwikPerfStoreRemembered>(`${PAGE_DEVTOOLS_PERF} ?? null`);
    },

    async readPreloadStore(): Promise<QwikPreloadStoreRemembered | null> {
      return readJsonFromPage<QwikPreloadStoreRemembered>(`${PAGE_DEVTOOLS_PRELOADS} ?? null`);
    },

    async clearPreloadStore(): Promise<void> {
      await evalInPage<void>(`${PAGE_DEVTOOLS_PRELOADS}?.clear?.()`);
    },

    subscribePreloadUpdates(): (() => void) | null {
      return null;
    },

    async readComponentTree(): Promise<QwikDevtoolsComponentSnapshot[] | null> {
      await ensurePageHooks();
      return readHookJson<QwikDevtoolsComponentSnapshot[]>('getComponentTreeSnapshot');
    },

    async readSignals(): Promise<QwikDevtoolsSignalsSnapshot | null> {
      await ensurePageHooks();
      return readHookJson<QwikDevtoolsSignalsSnapshot>('getSignalsSnapshot');
    },

    async readVNodeTree(): Promise<VNodeTreeNode[] | null> {
      await ensurePageHooks();
      return readHookJson<VNodeTreeNode[]>('getVNodeTree');
    },

    subscribeTreeUpdates(cb: (tree: VNodeTreeNode[]) => void): (() => void) | null {
      const port = getDevtoolsPort();
      if (!port?.onMessage) {
        return null;
      }

      const handler = (message: unknown) => {
        if (
          isExtensionMessage(message) &&
          message.type === DEVTOOLS_MESSAGES.types.componentTreeUpdate &&
          Array.isArray(message.payload)
        ) {
          cb(message.payload);
        }
      };

      port.onMessage.addListener(handler);
      return () => port.onMessage.removeListener(handler);
    },

    async readComponentDetail(
      componentName: string,
      qrlChunk?: string
    ): Promise<ComponentDetailEntry[] | null> {
      await ensurePageHooks();
      return readHookJson<ComponentDetailEntry[]>('getComponentDetail', componentName, qrlChunk);
    },

    async readNodeProps(nodeId: string): Promise<Record<string, unknown> | null> {
      await ensurePageHooks();
      return readHookJson<Record<string, unknown>>('getNodeProps', nodeId);
    },

    async setSignalValue(
      componentName: string,
      qrlChunk: string | undefined,
      variableName: string,
      newValue: unknown
    ): Promise<boolean> {
      await ensurePageHooks();
      return (
        (await evalInPage<boolean>(
          `!!${hookCall('setSignalValue', componentName, qrlChunk, variableName, newValue)}`
        )) ?? false
      );
    },

    async highlightElement(nodeId: string, componentName: string): Promise<void> {
      await ensurePageHooks();
      await evalInPage<void>(hookCall('highlightNode', nodeId, componentName));
    },

    async unhighlightElement(): Promise<void> {
      await evalInPage<void>(hookCall('unhighlightNode'));
    },

    subscribeRenderEvents(cb: (event: RenderEvent) => void): (() => void) | null {
      const port = getDevtoolsPort();
      if (!port?.onMessage) {
        return null;
      }

      const handler = (message: unknown) => {
        if (isExtensionMessage(message) && message.type === DEVTOOLS_MESSAGES.types.render) {
          cb(message.payload);
        }
      };

      port.onMessage.addListener(handler);
      return () => port.onMessage.removeListener(handler);
    },
  };
}
