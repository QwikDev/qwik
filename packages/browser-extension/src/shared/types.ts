import type {
  QwikDevtoolsComponentSnapshot,
  QwikDevtoolsSignalsSnapshot,
  QwikPerfStoreRemembered,
  QwikPreloadStoreRemembered,
} from '@qwik.dev/devtools/kit';

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

export interface VNodeTreeNode {
  name?: string;
  id: string;
  label?: string;
  props?: Record<string, unknown>;
  children?: VNodeTreeNode[];
}

export interface ComponentDetailEntry {
  hookType: string;
  variableName: string;
  data: unknown;
}

export interface RenderEvent {
  component: string;
  phase: string;
  duration: number;
  timestamp: number;
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
