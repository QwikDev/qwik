/**
 * @file
 *
 *   The only place where the serializer may import core types through relative `../` paths.
 */

export type { Projection, SlotScope } from '../core/dom/slot/slot';
export type { SsrDomEffect, SsrScalarDomEffect } from '../core/dom/effect/ssr-effect';
export type { Source, SourceSubs } from '../core/reactive/source';
export type { RuntimeInvokeContext } from '../core/runtime/invoke-context';
export type { OwnerItem } from '../core/runtime/owner';
export type { Subscriber } from '../core/runtime/subscriber';
export type { QRLInternal } from '../core/shared/qrl/qrl-class';
export type { QRL } from '../core/shared/qrl/qrl.public';
export type { ValueOrPromise } from '../core/shared/utils/types';
