import type {
  Component,
  QwikDevtoolsComponentSnapshot,
  QwikDevtoolsSignalsSnapshot,
  QwikPerfStoreRemembered,
  QwikPreloadStoreRemembered,
} from '@qwik.dev/devtools/kit';
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

function getDevtoolsPort(): DevtoolsPort | null {
  const port = (window as unknown as { __devtools_port?: DevtoolsPort }).__devtools_port;
  return port ?? null;
}

function toLiteral(value: unknown): string {
  return JSON.stringify(value ?? null);
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
  await injectPageScript('/devtools-hook.js', '!!window.__QWIK_DEVTOOLS_HOOK__');
  await injectPageScript(
    '/vnode-bridge.js',
    '!!(window.__QWIK_DEVTOOLS_HOOK__ && window.__QWIK_DEVTOOLS_HOOK__.getVNodeTree)'
  );
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
        evalInPage<boolean>('!!window.__QWIK_DEVTOOLS_HOOK__'),
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

export function createRemotePageDataSource() {
  return {
    async readPerfData(): Promise<QwikPerfStoreRemembered | null> {
      return readJsonFromPage<QwikPerfStoreRemembered>('window.__QWIK_PERF__ ?? null');
    },

    async readPreloadStore(): Promise<QwikPreloadStoreRemembered | null> {
      return readJsonFromPage<QwikPreloadStoreRemembered>('window.__QWIK_PRELOADS__ ?? null');
    },

    async clearPreloadStore(): Promise<void> {
      await evalInPage<void>('window.__QWIK_PRELOADS__?.clear?.()');
    },

    subscribePreloadUpdates(): (() => void) | null {
      return null;
    },

    async readComponentTree(): Promise<QwikDevtoolsComponentSnapshot[] | null> {
      await ensurePageHooks();
      return readJsonFromPage<QwikDevtoolsComponentSnapshot[]>(
        'window.__QWIK_DEVTOOLS_HOOK__?.getComponentTreeSnapshot?.() ?? null'
      );
    },

    async readSignals(): Promise<QwikDevtoolsSignalsSnapshot | null> {
      await ensurePageHooks();
      return readJsonFromPage<QwikDevtoolsSignalsSnapshot>(
        'window.__QWIK_DEVTOOLS_HOOK__?.getSignalsSnapshot?.() ?? null'
      );
    },

    async readVNodeTree(): Promise<VNodeTreeNode[] | null> {
      await ensurePageHooks();
      return readJsonFromPage<VNodeTreeNode[]>(
        'window.__QWIK_DEVTOOLS_HOOK__?.getVNodeTree?.() ?? null'
      );
    },

    subscribeTreeUpdates(cb: (tree: VNodeTreeNode[]) => void): (() => void) | null {
      const port = getDevtoolsPort();
      if (!port?.onMessage) {
        return null;
      }

      const handler = (message: unknown) => {
        if (
          isExtensionMessage(message) &&
          message.type === 'COMPONENT_TREE_UPDATE' &&
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
      return readJsonFromPage<ComponentDetailEntry[]>(
        `window.__QWIK_DEVTOOLS_HOOK__?.getComponentDetail?.(${toLiteral(
          componentName
        )}, ${toLiteral(qrlChunk)}) ?? null`
      );
    },

    async readNodeProps(nodeId: string): Promise<Record<string, unknown> | null> {
      await ensurePageHooks();
      return readJsonFromPage<Record<string, unknown>>(
        `window.__QWIK_DEVTOOLS_HOOK__?.getNodeProps?.(${toLiteral(nodeId)}) ?? null`
      );
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
          `!!window.__QWIK_DEVTOOLS_HOOK__?.setSignalValue?.(${toLiteral(
            componentName
          )}, ${toLiteral(qrlChunk)}, ${toLiteral(variableName)}, ${toLiteral(newValue)})`
        )) ?? false
      );
    },

    async highlightElement(nodeId: string, componentName: string): Promise<void> {
      await ensurePageHooks();
      await evalInPage<void>(
        `window.__QWIK_DEVTOOLS_HOOK__?.highlightNode?.(${toLiteral(
          nodeId
        )}, ${toLiteral(componentName)})`
      );
    },

    async unhighlightElement(): Promise<void> {
      await evalInPage<void>('window.__QWIK_DEVTOOLS_HOOK__?.unhighlightNode?.()');
    },

    subscribeRenderEvents(cb: (event: RenderEvent) => void): (() => void) | null {
      const port = getDevtoolsPort();
      if (!port?.onMessage) {
        return null;
      }

      const handler = (message: unknown) => {
        if (isExtensionMessage(message) && message.type === 'RENDER_EVENT') {
          cb(message.payload);
        }
      };

      port.onMessage.addListener(handler);
      return () => port.onMessage.removeListener(handler);
    },
  };
}
