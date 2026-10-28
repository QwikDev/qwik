/**
 * @file
 *
 *   The only place where the serializer may import core types through relative `../` paths.
 */

export type { SerializerArg } from '../core/reactive-primitives/types';
export type { Props } from '../core/shared/jsx/jsx-runtime';
export type { PropsProxy } from '../core/shared/jsx/props-proxy';
export type { QRLInternal } from '../core/shared/qrl/qrl-class';
export type { QRL } from '../core/shared/qrl/qrl.public';
export type { ObjToProxyMap } from '../core/shared/types';
export type { ValueOrPromise } from '../core/shared/utils/types';
export type {
  ISsrNode,
  SSRInternalStreamWriter,
  SSRWriteChunk,
  SymbolToChunkResolver,
} from '../core/ssr/ssr-types';
export type { VNodeData } from '../server/vnode-data';
