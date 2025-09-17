/**
 * @file
 *
 *   Importing directly from `qwik` is not allowed because the SSR package would end up with two
 *   copies of the code. Instead, the SSR package should import from `@qwik.dev/core`.
 *
 *   The exception to this rule is importing types, because those get elided by TypeScript. To make
 *   ensuring that this rule is followed, this file is the only place where relative `../` imports
 *   of types only are allowed.
 *
 *   (Then it is easy to verify that there are no imports which have `../` in their path, except for
 *   this file, which is only allowed to import types)
 */

export type { CorePlatformServer } from '../core/shared/platform/types';
export type { QRLInternal } from '../core/shared/qrl/qrl-class';
export type { JSXOutput, JSXNodeInternal } from '../core/shared/jsx/types/jsx-node';
export type { JSXChildren } from '../core/shared/jsx/types/jsx-qwik-attributes';
export type { ContextId } from '../core/use/use-context';
export type { ValueOrPromise } from '../core/shared/utils/types';
export type { SerializationContext } from '../core/shared/serdes/index';
export type { Container, HostElement, ObjToProxyMap } from '../core/shared/types';
export type {
  ISsrComponentFrame,
  ISsrNode,
  SSRContainer,
  SsrAttrs,
  SsrAttrKey,
  SsrAttrValue,
  StreamWriter,
} from '../core/ssr/ssr-types';
export type { ResolvedManifest, SymbolMapper } from '../optimizer/src/types';
export type { SymbolToChunkResolver } from '../core/ssr/ssr-types';
export type { NodePropData } from '../core/reactive-primitives/subscription-data';
export type { SignalImpl } from '../core/reactive-primitives/impl/signal-impl';
