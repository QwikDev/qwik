import {
  QWIK_PRELOADS_UPDATE_EVENT,
  type QwikPerfStoreRemembered,
  type QwikPreloadStoreRemembered,
  type QwikDevtoolsComponentSnapshot,
  type QwikDevtoolsSignalsSnapshot,
} from '@qwik.dev/devtools/kit';
import { isBrowser } from '@qwik.dev/core';

/**
 * Abstraction for accessing page-level data from different contexts.
 *
 * - In the overlay, data lives on the same `window` (direct access).
 * - In the browser extension panel, data must be read from the inspected page via
 *   `chrome.devtools.inspectedWindow.eval()`.
 *
 * Components use {@link getPageDataSource} to obtain the active source, which returns
 * {@link InPageDataSource} by default (overlay mode). The extension entry point replaces it via
 * `window.__QWIK_DEVTOOLS_PAGE_DATA_SOURCE__`.
 */
export interface PageDataSource {
  /** Read the performance store snapshot. */
  readPerfData(): Promise<QwikPerfStoreRemembered | null>;

  /** Read the preload store snapshot. */
  readPreloadStore(): Promise<QwikPreloadStoreRemembered | null>;

  /** Clear the preload store on the page. */
  clearPreloadStore(): Promise<void>;

  /**
   * Subscribe to preload store updates. Returns an unsubscribe function, or `null` if live
   * subscriptions are not supported (e.g. extension mode uses polling instead).
   */
  subscribePreloadUpdates(cb: () => void): (() => void) | null;

  /** Read the component tree from the devtools hook. */
  readComponentTree(): Promise<QwikDevtoolsComponentSnapshot[] | null>;

  /** Read signal values from the devtools hook. */
  readSignals(): Promise<QwikDevtoolsSignalsSnapshot | null>;

  /** Read the VNode component tree from the devtools hook. */
  readVNodeTree(): Promise<VNodeTreeNode[] | null>;

  /**
   * Subscribe to real-time VNode tree updates pushed by the page. Returns an unsubscribe function,
   * or `null` if not supported.
   */
  subscribeTreeUpdates(cb: (tree: VNodeTreeNode[]) => void): (() => void) | null;

  /** Read detailed hook data for a specific component (deeply serialized). */
  readComponentDetail(
    componentName: string,
    qrlChunk?: string
  ): Promise<ComponentDetailEntry[] | null>;

  /** Read VNode props for a specific tree node by ID. */
  readNodeProps(nodeId: string): Promise<Record<string, unknown> | null>;

  /** Set a signal value on a component. Returns true on success. */
  setSignalValue(
    componentName: string,
    qrlChunk: string | undefined,
    variableName: string,
    newValue: unknown
  ): Promise<boolean>;

  /** Highlight a component's DOM element on the page using its VNode tree node ID. */
  highlightElement(nodeId: string, componentName: string): Promise<void>;

  /** Remove the highlight overlay from the page. */
  unhighlightElement(): Promise<void>;

  /** Subscribe to live render events (CSR component renders with timing). */
  subscribeRenderEvents(cb: (event: RenderEvent) => void): (() => void) | null;
}

/** A single render event emitted by the performance runtime. */
export interface RenderEvent {
  component: string;
  phase: string;
  duration: number;
  timestamp: number;
}

/** A single hook entry with deeply serialized data. */
export interface ComponentDetailEntry {
  hookType: string;
  variableName: string;
  data: unknown;
}

/** Extended hook methods added by the VNode bridge (not in base kit types). */
interface QwikDevtoolsHookExtended {
  getVNodeTree?(): VNodeTreeNode[] | null;
  getNodeProps?(nodeId: string): Record<string, unknown> | null;
  getComponentDetail?(name: string, chunk?: string): ComponentDetailEntry[] | null;
  setSignalValue?(name: string, chunk: string | undefined, varName: string, val: unknown): boolean;
}

/** Serializable VNode tree node (matches overlay's TreeNode shape). */
export interface VNodeTreeNode {
  name?: string;
  id: string;
  label?: string;
  props?: Record<string, unknown>;
  children?: VNodeTreeNode[];
}

/**
 * Default implementation that reads directly from `window` globals. Used when the devtools UI runs
 * as an in-app overlay (same document).
 */
class InPageDataSource implements PageDataSource {
  async readPerfData(): Promise<QwikPerfStoreRemembered | null> {
    if (!isBrowser) {
      return null;
    }
    return window.__QWIK_PERF__ ?? null;
  }

  async readPreloadStore(): Promise<QwikPreloadStoreRemembered | null> {
    if (!isBrowser) {
      return null;
    }
    return window.__QWIK_PRELOADS__ ?? null;
  }

  async clearPreloadStore(): Promise<void> {
    if (!isBrowser) {
      return;
    }
    window.__QWIK_PRELOADS__?.clear();
  }

  subscribePreloadUpdates(cb: () => void): (() => void) | null {
    if (!isBrowser) {
      return null;
    }
    window.addEventListener(QWIK_PRELOADS_UPDATE_EVENT, cb);
    return () => window.removeEventListener(QWIK_PRELOADS_UPDATE_EVENT, cb);
  }

  async readComponentTree(): Promise<QwikDevtoolsComponentSnapshot[] | null> {
    if (!isBrowser) {
      return null;
    }
    return window.__QWIK_DEVTOOLS_HOOK__?.getComponentTreeSnapshot() ?? null;
  }

  async readSignals(): Promise<QwikDevtoolsSignalsSnapshot | null> {
    if (!isBrowser) {
      return null;
    }
    return window.__QWIK_DEVTOOLS_HOOK__?.getSignalsSnapshot() ?? null;
  }

  async readVNodeTree(): Promise<VNodeTreeNode[] | null> {
    if (!isBrowser) {
      return null;
    }
    const hook = window.__QWIK_DEVTOOLS_HOOK__ as QwikDevtoolsHookExtended | undefined;
    return hook?.getVNodeTree?.() ?? null;
  }

  subscribeTreeUpdates(cb: (tree: VNodeTreeNode[]) => void): (() => void) | null {
    if (!isBrowser) {
      return null;
    }
    const handler = (e: MessageEvent) => {
      if (
        e.data?.source === 'qwik-devtools' &&
        e.data?.type === 'COMPONENT_TREE_UPDATE' &&
        Array.isArray(e.data?.tree)
      ) {
        cb(e.data.tree);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }

  async readNodeProps(nodeId: string): Promise<Record<string, unknown> | null> {
    if (!isBrowser) {
      return null;
    }
    const hook = window.__QWIK_DEVTOOLS_HOOK__ as QwikDevtoolsHookExtended | undefined;
    return hook?.getNodeProps?.(nodeId) ?? null;
  }

  async readComponentDetail(
    componentName: string,
    qrlChunk?: string
  ): Promise<ComponentDetailEntry[] | null> {
    if (!isBrowser) {
      return null;
    }
    const hook = window.__QWIK_DEVTOOLS_HOOK__ as QwikDevtoolsHookExtended | undefined;
    return hook?.getComponentDetail?.(componentName, qrlChunk) ?? null;
  }

  async setSignalValue(
    componentName: string,
    qrlChunk: string | undefined,
    variableName: string,
    newValue: unknown
  ): Promise<boolean> {
    if (!isBrowser) {
      return false;
    }
    const hook = window.__QWIK_DEVTOOLS_HOOK__ as QwikDevtoolsHookExtended | undefined;
    return hook?.setSignalValue?.(componentName, qrlChunk, variableName, newValue) ?? false;
  }

  // No-ops in overlay mode (highlight is handled by the extension's eval)
  async highlightElement(): Promise<void> {}
  async unhighlightElement(): Promise<void> {}

  subscribeRenderEvents(cb: (event: RenderEvent) => void): (() => void) | null {
    if (!isBrowser) {
      return null;
    }
    const handler = (e: MessageEvent) => {
      if (e.data?.source === 'qwik-devtools' && e.data?.type === 'RENDER_EVENT' && e.data?.event) {
        cb(e.data.event);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }
}

const defaultSource = new InPageDataSource();

/**
 * Return the active page data source.
 *
 * When `window.__QWIK_DEVTOOLS_PAGE_DATA_SOURCE__` is set (by the browser extension entry point),
 * that source is used. Otherwise the default in-page source is returned.
 */
export function getPageDataSource(): PageDataSource {
  if (isBrowser && window.__QWIK_DEVTOOLS_PAGE_DATA_SOURCE__) {
    return window.__QWIK_DEVTOOLS_PAGE_DATA_SOURCE__;
  }
  return defaultSource;
}

declare global {
  interface Window {
    /**
     * When set before the UI mounts, components will use this source to read page data instead of
     * direct `window` access.
     */
    __QWIK_DEVTOOLS_PAGE_DATA_SOURCE__?: PageDataSource;
  }
}
