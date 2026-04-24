export const QWIK_CONTAINER_SELECTOR =
  '[q\\:container]:not([q\\:container="html"]):not([q\\:container="text"])';

export const V2_BINDING_ATTR = ':';

export const QWIK_ATTR = {
  BASE: 'q:base',
  CONTAINER: 'q:container',
  ID: 'q:id',
  KEY: 'q:key',
  MANIFEST_HASH: 'q:manifest-hash',
  RENDER: 'q:render',
  RUNTIME: 'q:instance',
  VERSION: 'q:version',
} as const;
