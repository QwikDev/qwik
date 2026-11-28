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
  type QwikDevtoolsHookExtended,
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
  protected readonly bridge: ReturnType<typeof createInPageBridge>;

  constructor(browser = isBrowser, getWindow?: () => Window | null) {
    this.bridge = createInPageBridge({ isBrowser: browser, getWindow });
  }

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
  async highlightElement(_nodeId: string, _componentName: string): Promise<void> {}
  async unhighlightElement(): Promise<void> {}

  subscribeRenderEvents(cb: (event: RenderEvent) => void): (() => void) | null {
    return this.bridge.subscribeRenderEvents(cb);
  }
}

export function findHostQwikWindow(frame: Window): Window | null {
  try {
    let current = frame;
    while (current !== current.parent) {
      current = current.parent;
      if (getQwikDevtoolsGlobal(current)) {
        return current;
      }
    }
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'SecurityError') {
      throw error;
    }
  }
  return null;
}

class IframePageDataSource extends InPageDataSource {
  constructor(private readonly frame: Window) {
    super(true, () => findHostQwikWindow(frame));
  }

  private subscribeToHost(
    subscribe: () => (() => void) | null,
    onConnect?: (isCurrent: () => boolean) => void
  ): () => void {
    let target: Window | null = null;
    let targetDocument: Document | undefined;
    let unsubscribe: (() => void) | null = null;
    let generation = 0;
    const rebind = () => {
      const next = findHostQwikWindow(this.frame);
      const nextDocument = next?.document;
      if (next === target && nextDocument === targetDocument) {
        return;
      }
      unsubscribe?.();
      const currentGeneration = ++generation;
      target = next;
      targetDocument = nextDocument;
      unsubscribe = next ? subscribe() : null;
      if (next) {
        onConnect?.(() => generation === currentGeneration);
      }
    };
    rebind();
    const timer = setInterval(rebind, 500);
    return () => {
      clearInterval(timer);
      generation++;
      unsubscribe?.();
    };
  }

  override subscribePreloadUpdates(cb: () => void): () => void {
    return this.subscribeToHost(() => this.bridge.subscribePreloadUpdates(cb), cb);
  }

  override subscribeTreeUpdates(cb: (tree: VNodeTreeNode[]) => void): () => void {
    return this.subscribeToHost(
      () => this.bridge.subscribeTreeUpdates(cb),
      (isCurrent) => {
        void this.bridge.readVNodeTree().then((tree) => {
          if (tree && isCurrent()) {
            cb(tree);
          }
        });
      }
    );
  }

  override subscribeRenderEvents(cb: (event: RenderEvent) => void): () => void {
    return this.subscribeToHost(() => this.bridge.subscribeRenderEvents(cb));
  }

  override async highlightElement(nodeId: string, componentName: string): Promise<void> {
    const hook = getQwikDevtoolsGlobal(findHostQwikWindow(this.frame))?.[
      QWIK_DEVTOOLS_GLOBAL.props.hook
    ] as QwikDevtoolsHookExtended | undefined;
    hook?.highlightNode?.(nodeId, componentName);
  }

  override async unhighlightElement(): Promise<void> {
    const hook = getQwikDevtoolsGlobal(findHostQwikWindow(this.frame))?.[
      QWIK_DEVTOOLS_GLOBAL.props.hook
    ] as QwikDevtoolsHookExtended | undefined;
    hook?.unhighlightNode?.();
  }
}

export function createIframePageDataSource(frame: Window): PageDataSource {
  return new IframePageDataSource(frame);
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
