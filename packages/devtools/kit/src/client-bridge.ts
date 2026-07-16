import type {
  QwikDevtoolsComponentSnapshot,
  QwikDevtoolsHook,
  QwikDevtoolsSignalsSnapshot,
} from './hook-types';
import type { QwikPerfStoreRemembered, QwikPreloadStoreRemembered } from './globals';
import { getQwikDevtoolsGlobal } from './global-store';
import { QWIK_DEVTOOLS_GLOBAL } from './protocol/globals';
import { DEVTOOLS_MESSAGES, type QwikDevtoolsPageMessage } from './protocol/messages';
import type { DevtoolsVNodeTreeNode } from './protocol/vnode';
import type { DevtoolsRenderEvent } from './protocol/perf';
import type { DevtoolsComponentDetailEntry } from './protocol/hooks';

export interface InPageBridgeOptions {
  isBrowser: boolean;
}

export interface InPageBridge {
  readPerfData(): Promise<QwikPerfStoreRemembered | null>;
  readPreloadStore(): Promise<QwikPreloadStoreRemembered | null>;
  clearPreloadStore(): Promise<void>;
  subscribePreloadUpdates(cb: () => void): (() => void) | null;
  readComponentTree(): Promise<QwikDevtoolsComponentSnapshot[] | null>;
  readSignals(): Promise<QwikDevtoolsSignalsSnapshot | null>;
  readVNodeTree(): Promise<DevtoolsVNodeTreeNode[] | null>;
  subscribeTreeUpdates(cb: (tree: DevtoolsVNodeTreeNode[]) => void): (() => void) | null;
  readComponentDetail(
    componentName: string,
    qrlChunk?: string
  ): Promise<DevtoolsComponentDetailEntry[] | null>;
  readNodeProps(nodeId: string): Promise<Record<string, unknown> | null>;
  setSignalValue(
    componentName: string,
    qrlChunk: string | undefined,
    variableName: string,
    newValue: unknown
  ): Promise<boolean>;
  subscribeRenderEvents(cb: (event: DevtoolsRenderEvent) => void): (() => void) | null;
}

/**
 * Page-level data access contract shared by the in-app overlay (same window) and the browser
 * extension panel (reads the inspected page via chrome.devtools eval). Both implementations depend
 * on this shape so a change to one side is type-checked against the other.
 */
export interface PageDataSource {
  readPerfData(): Promise<QwikPerfStoreRemembered | null>;
  readPreloadStore(): Promise<QwikPreloadStoreRemembered | null>;
  clearPreloadStore(): Promise<void>;
  /** Returns an unsubscribe fn, or null when live subscriptions are unsupported (extension polls). */
  subscribePreloadUpdates(cb: () => void): (() => void) | null;
  readComponentTree(): Promise<QwikDevtoolsComponentSnapshot[] | null>;
  readSignals(): Promise<QwikDevtoolsSignalsSnapshot | null>;
  readVNodeTree(): Promise<DevtoolsVNodeTreeNode[] | null>;
  subscribeTreeUpdates(cb: (tree: DevtoolsVNodeTreeNode[]) => void): (() => void) | null;
  readComponentDetail(
    componentName: string,
    qrlChunk?: string
  ): Promise<DevtoolsComponentDetailEntry[] | null>;
  readNodeProps(nodeId: string): Promise<Record<string, unknown> | null>;
  setSignalValue(
    componentName: string,
    qrlChunk: string | undefined,
    variableName: string,
    newValue: unknown
  ): Promise<boolean>;
  /** Highlight a component's DOM element on the page by its VNode tree node id. */
  highlightElement(nodeId: string, componentName: string): Promise<void>;
  unhighlightElement(): Promise<void>;
  subscribeRenderEvents(cb: (event: DevtoolsRenderEvent) => void): (() => void) | null;
}

interface QwikDevtoolsHookExtended extends QwikDevtoolsHook {
  getVNodeTree?(): DevtoolsVNodeTreeNode[] | null;
  getNodeProps?(nodeId: string): Record<string, unknown> | null;
  getComponentDetail?(name: string, chunk?: string): DevtoolsComponentDetailEntry[] | null;
  setSignalValue?(name: string, chunk: string | undefined, varName: string, val: unknown): boolean;
}

function getPageWindow(isBrowser: boolean): Window | null {
  if (!isBrowser || typeof window === 'undefined') {
    return null;
  }
  return window;
}

function getHook(pageWindow: Window | null): QwikDevtoolsHookExtended | undefined {
  return getQwikDevtoolsGlobal(pageWindow)?.[QWIK_DEVTOOLS_GLOBAL.props.hook] as
    | QwikDevtoolsHookExtended
    | undefined;
}

export function createInPageBridge(options: InPageBridgeOptions): InPageBridge {
  const getWindow = () => getPageWindow(options.isBrowser);

  return {
    async readPerfData() {
      return getQwikDevtoolsGlobal(getWindow())?.[QWIK_DEVTOOLS_GLOBAL.props.perf] ?? null;
    },

    async readPreloadStore() {
      return getQwikDevtoolsGlobal(getWindow())?.[QWIK_DEVTOOLS_GLOBAL.props.preloads] ?? null;
    },

    async clearPreloadStore() {
      getQwikDevtoolsGlobal(getWindow())?.[QWIK_DEVTOOLS_GLOBAL.props.preloads]?.clear();
    },

    subscribePreloadUpdates(cb) {
      const pageWindow = getWindow();
      if (!pageWindow) {
        return null;
      }
      pageWindow.addEventListener(DEVTOOLS_MESSAGES.events.preloadsUpdate, cb);
      return () => pageWindow.removeEventListener(DEVTOOLS_MESSAGES.events.preloadsUpdate, cb);
    },

    async readComponentTree() {
      return getHook(getWindow())?.getComponentTreeSnapshot() ?? null;
    },

    async readSignals() {
      return getHook(getWindow())?.getSignalsSnapshot() ?? null;
    },

    async readVNodeTree() {
      return getHook(getWindow())?.getVNodeTree?.() ?? null;
    },

    subscribeTreeUpdates(cb) {
      const pageWindow = getWindow();
      if (!pageWindow) {
        return null;
      }
      const handler = (event: MessageEvent<QwikDevtoolsPageMessage>) => {
        const message = event.data;
        if (
          message?.source === DEVTOOLS_MESSAGES.pageSource &&
          message.type === DEVTOOLS_MESSAGES.types.componentTreeUpdate &&
          Array.isArray(message.tree)
        ) {
          cb(message.tree as DevtoolsVNodeTreeNode[]);
        }
      };
      pageWindow.addEventListener('message', handler);
      return () => pageWindow.removeEventListener('message', handler);
    },

    async readComponentDetail(componentName, qrlChunk) {
      return getHook(getWindow())?.getComponentDetail?.(componentName, qrlChunk) ?? null;
    },

    async readNodeProps(nodeId) {
      return getHook(getWindow())?.getNodeProps?.(nodeId) ?? null;
    },

    async setSignalValue(componentName, qrlChunk, variableName, newValue) {
      return (
        getHook(getWindow())?.setSignalValue?.(componentName, qrlChunk, variableName, newValue) ??
        false
      );
    },

    subscribeRenderEvents(cb) {
      const pageWindow = getWindow();
      if (!pageWindow) {
        return null;
      }
      const handler = (event: MessageEvent<QwikDevtoolsPageMessage>) => {
        const message = event.data;
        if (
          message?.source === DEVTOOLS_MESSAGES.pageSource &&
          message.type === DEVTOOLS_MESSAGES.types.render &&
          message.event
        ) {
          cb(message.event as DevtoolsRenderEvent);
        }
      };
      pageWindow.addEventListener('message', handler);
      return () => pageWindow.removeEventListener('message', handler);
    },
  };
}
