/**
 * @file
 *
 *   Importing directly from `qwik` is not allowed because the SSR package would end up with two
 *   copies of the code. Instead, the SSR package should import from `@builder.io/qwik`.
 *
 *   The exception to this rule is importing types, because those get elided by TypeScript. To make
 *   ensuring that this rule is followed, this file is the only place where relative `../` imports
 *   of types only are allowed.
 *
 *   (Then it is easy to verify that there are no imports which have `../` in their path, except for
 *   this file, which is only allowed to import types)
 */

export type { ObjToProxyMap } from '../core/container/container';
export type { CorePlatformServer } from '../core/platform/types';
export type { QRLInternal } from '../core/qrl/qrl-class';
export type { JSXOutput } from '../core/render/jsx/types/jsx-node';
export type { JSXChildren } from '../core/render/jsx/types/jsx-qwik-attributes';
export type { SubscriptionManager } from '../core/state/common';
export type { QContext } from '../core/state/context';
export type { ContextId } from '../core/use/use-context';
export type { ValueOrPromise } from '../core/util/types';
export type { SerializationContext } from '../core/v2/shared/shared-serialization';
export type { Container2, HostElement } from '../core/v2/shared/types';
export type {
  ISsrComponentFrame,
  ISsrNode,
  SSRContainer,
  SsrAttrs,
  SsrAttrKey,
  SsrAttrValue,
  StreamWriter,
} from '../core/v2/ssr/ssr-types';
export type { ResolvedManifest, SymbolMapper } from '../optimizer/src/types';
export type { SymbolToChunkResolver } from '../core/v2/ssr/ssr-types';
export type { fixMeAny } from '../core/v2/shared/types';
