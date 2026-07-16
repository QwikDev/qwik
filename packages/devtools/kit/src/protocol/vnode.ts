export const QWIK_VNODE_PROTOCOL = {
  attrs: {
    seq: 'q:seq',
    props: 'q:props',
    renderFn: 'q:renderFn',
    type: 'q:type',
    id: 'q:id',
    key: 'q:key',
    colon: ':',
  },
  qrl: {
    qrl: '$qrl$',
    computed: '$computeQrl$',
    chunk: '$chunk$',
    symbol: '$symbol$',
    captureRef: '$captureRef$',
    untrackedValue: '$untrackedValue$',
  },
  bridgeVirtualModuleId: 'virtual:qwik-devtools-bridge',
} as const;

/**
 * Serializable VNode tree node exchanged between the page hook and the devtools UI/extension.
 * Shared data contract: do not redeclare in consumers, import it from here.
 */
export interface DevtoolsVNodeTreeNode {
  name?: string;
  id: string;
  label?: string;
  props?: Record<string, unknown>;
  children?: DevtoolsVNodeTreeNode[];
}
