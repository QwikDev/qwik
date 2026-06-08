import {
  createInPageBridge,
  getQwikDevtoolsGlobal,
  QWIK_DEVTOOLS_GLOBAL,
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
 * `window.__QWIK_DEVTOOLS__.pageDataSource`.
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
  private readonly bridge = createInPageBridge({ isBrowser });

  async readPerfData(): Promise<QwikPerfStoreRemembered | null> {
    return this.bridge.readPerfData();
  }

  async readPreloadStore(): Promise<QwikPreloadStoreRemembered | null> {
    return this.bridge.readPreloadStore();
  }

  async clearPreloadStore(): Promise<void> {
    return this.bridge.clearPreloadStore();
  }

  subscribePreloadUpdates(cb: () => void): (() => void) | null {
    return this.bridge.subscribePreloadUpdates(cb);
  }

  async readComponentTree(): Promise<QwikDevtoolsComponentSnapshot[] | null> {
    return this.bridge.readComponentTree();
  }

  async readSignals(): Promise<QwikDevtoolsSignalsSnapshot | null> {
    return this.bridge.readSignals();
  }

  async readVNodeTree(): Promise<VNodeTreeNode[] | null> {
    return this.bridge.readVNodeTree();
  }

  subscribeTreeUpdates(cb: (tree: VNodeTreeNode[]) => void): (() => void) | null {
    return this.bridge.subscribeTreeUpdates(cb);
  }

  async readNodeProps(nodeId: string): Promise<Record<string, unknown> | null> {
    return this.bridge.readNodeProps(nodeId);
  }

  async readComponentDetail(
    componentName: string,
    qrlChunk?: string
  ): Promise<ComponentDetailEntry[] | null> {
    return this.bridge.readComponentDetail(componentName, qrlChunk);
  }

  async setSignalValue(
    componentName: string,
    qrlChunk: string | undefined,
    variableName: string,
    newValue: unknown
  ): Promise<boolean> {
    return this.bridge.setSignalValue(componentName, qrlChunk, variableName, newValue);
  }

  // No-ops in overlay mode (highlight is handled by the extension's eval)
  async highlightElement(): Promise<void> {}
  async unhighlightElement(): Promise<void> {}

  subscribeRenderEvents(cb: (event: RenderEvent) => void): (() => void) | null {
    return this.bridge.subscribeRenderEvents(cb);
  }
}

const defaultSource = new InPageDataSource();

/**
 * Return the active page data source.
 *
 * When the Qwik DevTools root has a `pageDataSource` (by the browser extension entry point), that
 * source is used. Otherwise the default in-page source is returned.
 */
export function getPageDataSource(): PageDataSource {
  const source = isBrowser
    ? (getQwikDevtoolsGlobal(window)?.[QWIK_DEVTOOLS_GLOBAL.props.pageDataSource] as
        | PageDataSource
        | undefined)
    : undefined;
  if (source) {
    return source;
  }
  return defaultSource;
}
