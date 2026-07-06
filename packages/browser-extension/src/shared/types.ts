import type {
  DevtoolsVNodeTreeNode as VNodeTreeNode,
  DevtoolsComponentDetailEntry as ComponentDetailEntry,
  DevtoolsRenderEvent as RenderEvent,
  QwikDevtoolsComponentSnapshot,
  QwikDevtoolsSignalsSnapshot,
  QwikPerfStoreRemembered,
  QwikPreloadStoreRemembered,
} from '@qwik.dev/devtools/kit';

// The VNode/detail/render shapes are the shared data contract, owned by @qwik.dev/devtools/kit.
// Re-export under the local names so consumers keep one import source and cannot drift.
export type { VNodeTreeNode, ComponentDetailEntry, RenderEvent };

export interface QwikContainerInfo {
  detected: boolean;
  version: string | null;
  renderMode: string | null;
  containerState: string | null;
  base: string | null;
  manifestHash: string | null;
  containerCount: number;
  runtime: string | null;
}

export type ExtensionMessage =
  | { type: 'DETECT_QWIK' }
  | { type: 'QWIK_DETECTION_RESULT'; payload: QwikContainerInfo }
  | { type: 'START_INSPECT' }
  | { type: 'STOP_INSPECT' }
  | { type: 'PAGE_CHANGED' }
  | {
      type: 'ELEMENT_PICKED';
      payload: { qId?: string; colonId?: string; treeNodeId?: string };
    }
  | { type: 'COMPONENT_TREE_UPDATE'; payload: VNodeTreeNode[] }
  | { type: 'RENDER_EVENT'; payload: RenderEvent }
  | { type: 'OK' }
  | { type: `${string}_ERROR`; payload: { error: string } };

export interface PageRuntimeSnapshot {
  components: QwikDevtoolsComponentSnapshot[] | null;
  signals: QwikDevtoolsSignalsSnapshot | null;
  perf: QwikPerfStoreRemembered | null;
  preloads: QwikPreloadStoreRemembered | null;
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    !!value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string'
  );
}
