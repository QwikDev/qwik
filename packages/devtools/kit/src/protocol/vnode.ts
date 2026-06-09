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
