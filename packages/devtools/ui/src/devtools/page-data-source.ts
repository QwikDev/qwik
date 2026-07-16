import {
  createInPageBridge,
  getQwikDevtoolsGlobal,
  QWIK_DEVTOOLS_GLOBAL,
  type PageDataSource,
  type QwikPerfStoreRemembered,
  type QwikPreloadStoreRemembered,
  type QwikDevtoolsComponentSnapshot,
  type QwikDevtoolsSignalsSnapshot,
  type DevtoolsVNodeTreeNode as VNodeTreeNode,
  type DevtoolsComponentDetailEntry as ComponentDetailEntry,
  type DevtoolsRenderEvent as RenderEvent,
} from '@qwik.dev/devtools/kit';
import { isBrowser } from '@qwik.dev/core';

// The VNode/detail/render shapes and the PageDataSource contract are owned by
// @qwik.dev/devtools/kit. Re-export under the local names so feature components keep one import
// source and cannot drift.
export type { PageDataSource, VNodeTreeNode, ComponentDetailEntry, RenderEvent };

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
