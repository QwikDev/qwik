import { isDev } from '@qwik.dev/core/build';
import { NEEDS_COMPUTATION } from '../../reactive/constants';
import type { AsyncSignalOptions } from '../../reactive/public-types';
import { Branch, BranchRange, BranchSubscription } from '../../dom/branch/branch';
import {
  attachSuspense,
  ContentBlock,
  ContentSubscription,
  SuspenseContentSubscription,
  type ContentOutput,
} from '../../dom/content/content';
import { ForBlock, ForRange, IndexMode } from '../../dom/for/for';
import {
  AttrEffect,
  AttrExpressionEffect,
  DomBatchEffect,
  EventEffect,
  ForBlockSubscription,
  PropsEffect,
  type AttrExpressionFn,
} from '../../dom/effect/effect';
import type { QDispatchHandler } from '../../shared/types';
import type { DomEffect } from '../../dom/effect/dom-effect';
import {
  TextExpressionEffect,
  TextNodeEffect,
  type TextExpressionFn,
  type TextExpressionValue,
} from '../../dom/effect/text-effect';
import { EffectKind } from '../../dom/effect/effect-kind.enum';
import { EffectTargetKind } from '../../dom/effect/ssr-effect';
import { ComputedFlags, OwnerFlags, SubscriberFlags } from '../../reactive/flags';
import { AsyncSignal } from '../../reactive/async-signal';
import { ComputedQrl } from '../../reactive/computed-qrl';
import { SerializerSignal } from '../../reactive/serializer-signal';
import { createLazySourceSubs, LazySerialized } from '../../reactive/lazy-serialized';
import { Signal as ReactiveSignal } from '../../reactive/signal';
import {
  bindStoreSource,
  getStoreSource,
  StorePropSource,
  unwrapStore,
} from '../../reactive/store';
import { appendSourceSubscriber, type Source, type SourceSub } from '../../reactive/source';
import { addDependency } from '../../reactive/tracking';
import {
  getContextScopeForNode,
  whenRootInflated,
  type ContainerContext,
} from '../../runtime/container-context';
import type { ContextScope } from '../../runtime/context-scope';
import { newInvokeContext, type RuntimeInvokeContext } from '../../runtime/invoke-context';
import type { UseOnMap } from '../../runtime/use-on';
import {
  ProjectionBlock,
  ProjectionSubscription,
  type Projection,
  type SlotScope,
} from '../../dom/slot/slot';
import { EMPTY_ARRAY, EMPTY_NODES } from '../../utils/consts';
import {
  Owner,
  createOwner,
  registerOwnerToOwner,
  registerSubscriberToOwner,
  isResumeOwnerClosed,
  restoreOwnerItemOrder,
  disposeOwner,
} from '../../runtime/owner';
import { Phase } from '../../runtime/scheduler';
import {
  Task,
  TaskSubscription,
  VisibleTask,
  VisibleTaskSubscription,
  type TaskQrlRef,
} from '../../runtime/task';
import {
  findBranchRange,
  findBranchTextNode,
  findBranchTextRange,
  findContentRange,
  findProjectionRange,
  findElementText,
  findForRange,
  findQwikElement,
  findTextNode,
} from '../../runtime/node-walker';
import {
  isSubscriberDisposed,
  type ComputedSubscriber,
  type DomSubscriber,
  type Subscriber,
  type TaskSubscriber,
  type VisibleTaskSubscriber,
} from '../../runtime/subscriber';
import { getFunctionOrResolve, readExpression } from '../../utils/qrl';
import { isQrl } from '../qrl/qrl-utils';
import { readTrackedSourceValue } from '../../dom/effect/text-effect';
import type { QRL } from '../qrl/qrl.public';
import { assertDefined, assertNumber } from '../error/assert';
import { qError, QError } from '../error/error';
import type { QRLInternal } from '../qrl/qrl-class';
import { isPromise, maybeThen } from '../utils/promises';
import type { ValueOrPromise } from '../utils/types';
import { allocate, allocateDomEffect, pendingStoreTargets, resolvers } from './allocate';
import { PromiseRoot, unwrapPromiseRoot } from './promise-root';
import { EMPTY_OBJECT_PAYLOAD, TypeIds } from './constants';
import { needsInflation } from './constants';
import { disposeSubscriber } from '../../reactive/cleanup';
import { findContainerNode } from '../../dom/range/range';
import { _props, restorePropsProxyState, type PropSource } from '../../component/props';

export { allocate, needsInflation };

function readOwner(value: unknown): Owner | null {
  if (value !== null && !(value instanceof Owner)) {
    throw new Error('Invalid serialized owner reference');
  }
  return value;
}

function rejectDisposedInflation(subscriber: Subscriber): boolean {
  if (
    isSubscriberDisposed(subscriber) ||
    (subscriber.owner !== null && isResumeOwnerClosed(subscriber.owner))
  ) {
    subscriber.flags |= SubscriberFlags.Disposed;
    return true;
  }
  return false;
}

/** Restore owners and task code before notifying resumed subscribers. */
function lazySubscriber(
  container: ContainerContext,
  load: () => ValueOrPromise<Subscriber>
): LazySerialized<Subscriber> {
  return new LazySerialized<Subscriber>(
    () =>
      maybeThen(
        maybeThen(load(), (subscriber) => whenRootInflated(container, subscriber)),
        (subscriber) =>
          !isSubscriberDisposed(subscriber) &&
          subscriber instanceof TaskSubscription &&
          subscriber.task.phase === Phase.BlockingTask
            ? maybeThen(getFunctionOrResolve(subscriber.task.qrl!, container), () => subscriber)
            : subscriber
      ),
    container.scheduler
  );
}

const dangerousObjectKeys = new Set([
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'toJSON',
  'then',
]);

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

const isSafeObjectKV = (key: unknown, value: unknown): key is string | number => {
  if (typeof key === 'number') {
    return true;
  }
  return (
    typeof key === 'string' &&
    key !== '__proto__' &&
    (typeof value !== 'function' || !dangerousObjectKeys.has(key))
  );
};

const ownedTypes = new Set([
  TypeIds.EffectSubscription,
  TypeIds.SuspenseSubscription,
  TypeIds.Task,
  TypeIds.ComputedSignal,
  TypeIds.AsyncSignal,
  TypeIds.SerializerSignal,
]);

export const inflate = (
  container: ContainerContext,
  target: unknown,
  typeId: TypeIds,
  data: unknown
): ValueOrPromise<void> => {
  if (!ownedTypes.has(typeId)) {
    return inflatePayload(container, target, typeId, data);
  }
  if (!Array.isArray(data) || data.length < 4) {
    throw new Error('Missing serialized ownership');
  }
  const payload = data.slice(0, -4);
  return maybeThen(_eagerDeserializeArray(container, data.slice(-4)), ([owner, position]) => {
    if (
      (owner !== null && !(owner instanceof Owner)) ||
      !Number.isSafeInteger(position) ||
      (position as number) < 0
    ) {
      throw new Error('Invalid serialized ownership');
    }
    return maybeThen(owner === null ? null : whenRootInflated(container, owner), () => {
      const subscriber = target as Subscriber;
      if (isSubscriberDisposed(subscriber) || (owner !== null && isResumeOwnerClosed(owner))) {
        subscriber.flags |= SubscriberFlags.Disposed;
        return;
      }
      subscriber.owner = owner;
      return maybeThen(inflatePayload(container, target, typeId, payload), () => {
        if (owner !== null && isResumeOwnerClosed(owner)) {
          disposeSubscriber(subscriber);
          return;
        }
        if (owner !== null && !isSubscriberDisposed(subscriber)) {
          // Join the owner only after the shell is restored.
          if (
            owner.items !== subscriber &&
            (!Array.isArray(owner.items) || !owner.items.includes(subscriber))
          ) {
            subscriber.owner = null;
            registerSubscriberToOwner(subscriber, owner);
          }
          restoreOwnerItemOrder(subscriber, owner, position as number);
        }
      });
    });
  });
};

const inflatePayload = (
  container: ContainerContext,
  target: unknown,
  typeId: TypeIds,
  data: unknown
): ValueOrPromise<void> => {
  if (typeId === TypeIds.Plain) {
    // Already processed
    return;
  }
  if (typeId === TypeIds.Object && data !== EMPTY_OBJECT_PAYLOAD && !Array.isArray(data)) {
    throw new Error('Invalid Object payload');
  }
  // Restore the complex data, special case for Array
  if (
    typeId !== TypeIds.Array &&
    typeId !== TypeIds.BigArray &&
    typeId !== TypeIds.Signal &&
    typeId !== TypeIds.Store &&
    typeId !== TypeIds.StoreProp &&
    typeId !== TypeIds.PropSource &&
    typeId !== TypeIds.ComputedSignal &&
    typeId !== TypeIds.AsyncSignal &&
    typeId !== TypeIds.SerializerSignal &&
    Array.isArray(data)
  ) {
    return maybeThen(_eagerDeserializeArray(container, data), (data) => {
      if (ownedTypes.has(typeId) && rejectDisposedInflation(target as Subscriber)) {
        return;
      }
      return inflateResolved(container, target, typeId, data);
    });
  }
  return inflateResolved(container, target, typeId, data);
};

const inflateResolved = (
  container: ContainerContext,
  target: unknown,
  typeId: TypeIds,
  data: unknown
): ValueOrPromise<void> => {
  switch (typeId) {
    case TypeIds.Array:
    case TypeIds.BigArray:
      // Arrays are special, we need to fill the array in place
      return maybeThen(
        _eagerDeserializeArray(container, data as unknown[], target as unknown[]),
        () => undefined
      );
    case TypeIds.Object:
      if (data === EMPTY_OBJECT_PAYLOAD) {
        break;
      }
      for (let i = 0; i < (data as any[]).length; i += 2) {
        const key = (data as unknown[])[i];
        const value = (data as unknown[])[i + 1];
        if (!isSafeObjectKV(key, value)) {
          continue;
        }
        (target as Record<string, unknown>)[key] = value;
      }
      break;
    case TypeIds.Signal: {
      const signal = target as ReactiveSignal<unknown>;
      const d = data as unknown[];
      return maybeThen(deserializeData(container, d[0] as TypeIds, d[1]), (value) => {
        signal.v = unwrapPromiseRoot(value);
        if (d.length > 2) {
          restoreSourceSubs(signal, container, d, 2);
        }
      });
    }
    case TypeIds.Props: {
      const [statics, sources] = data as [unknown[], Record<string, unknown>];
      const props = target as Record<string, unknown>;
      for (let i = 0; i < statics.length; i += 2) {
        props[statics[i] as string] = statics[i + 1];
      }
      // Prop expressions recompute on every read, so resolve them now; a getter
      // cannot await the chunk and would throw at an unretryable read.
      let pendingExpressions: ValueOrPromise<unknown>[] | undefined;
      for (const key in sources) {
        const source = sources[key];
        // Branch once here rather than on every read.
        let get: () => unknown;
        if (isQrl(source)) {
          const expression = source as QRL<() => unknown>;
          get = () => readExpression(expression, container);
          const resolved = getFunctionOrResolve(expression, container);
          if (isPromise(resolved)) {
            (pendingExpressions ??= []).push(resolved);
          }
        } else {
          get = () => readTrackedSourceValue(source as Source<unknown>);
        }
        Object.defineProperty(props, key, { get, enumerable: true, configurable: true });
      }
      _props(props, sources);
      return pendingExpressions && maybeThen(Promise.all(pendingExpressions), () => {});
    }
    case TypeIds.PropsProxy: {
      const values = data as unknown[];
      const source = values[0];
      // A null separator marks views before their excluded keys.
      if (values.length >= 2) {
        const excluded = values.slice(2);
        if (
          values[1] !== null ||
          source === null ||
          typeof source !== 'object' ||
          !excluded.every((key) => typeof key === 'string')
        ) {
          throw new Error('Invalid PropsProxy view');
        }
        restorePropsProxyState(target as object, { source, excluded });
        break;
      }
      if (
        values.length !== 1 ||
        (!(source instanceof ReactiveSignal) && !(source instanceof StorePropSource))
      ) {
        throw new Error('Invalid PropsProxy source');
      }
      restorePropsProxyState(target as object, {
        source: source as Source<object>,
        excluded: null,
      });
      break;
    }
    case TypeIds.ComputedSignal: {
      const computed = target as Writeable<ComputedQrl<unknown>>;
      const d = data as unknown[];
      return maybeThen(deserializeData(container, d[0] as TypeIds, d[1]), (qrl) =>
        maybeThen(deserializeData(container, d[2] as TypeIds, d[3]), (deps) =>
          maybeThen(deserializeData(container, d[4] as TypeIds, d[5]), (value) => {
            if (rejectDisposedInflation(computed)) {
              return;
            }
            computed.computeQrl = qrl as ComputedQrl<unknown>['computeQrl'];
            computed.container = container;
            restoreDependencies(computed, deps as Source[]);
            if (value === NEEDS_COMPUTATION) {
              computed.flags = ComputedFlags.Dirty;
            } else {
              computed.v = value;
              computed.flags = ComputedFlags.HasValue;
            }
            if (d.length > 6) {
              restoreSourceSubs(computed, container, d, 6);
            }
            if (value === NEEDS_COMPUTATION) {
              return maybeThen(getFunctionOrResolve(computed.computeQrl!, container), () => {});
            }
          })
        )
      );
    }
    case TypeIds.AsyncSignal: {
      const signal = target as AsyncSignal<unknown>;
      const d = data as unknown[];
      const subscriberOffset = 8;
      return maybeThen(deserializeData(container, d[0] as TypeIds, d[1]), (qrl) =>
        maybeThen(deserializeData(container, d[2] as TypeIds, d[3]), (deps) =>
          maybeThen(deserializeData(container, d[4] as TypeIds, d[5]), (value) =>
            maybeThen(deserializeData(container, d[6] as TypeIds, d[7]), (options) => {
              if (rejectDisposedInflation(signal)) {
                return;
              }
              signal.computeQrl = qrl as AsyncSignal<unknown>['computeQrl'];
              signal.setOptions((options as AsyncSignalOptions<unknown> | null) ?? undefined);
              restoreDependencies(signal, deps as Source[]);
              if (value === NEEDS_COMPUTATION) {
                signal.flags = ComputedFlags.Dirty | ComputedFlags.Async;
              } else {
                signal.v = value as unknown;
                signal.flags = ComputedFlags.HasValue | ComputedFlags.Async;
              }
              if (d.length > subscriberOffset) {
                restoreSourceSubs(signal, container, d, subscriberOffset);
              }
              if (value === NEEDS_COMPUTATION) {
                return maybeThen(getFunctionOrResolve(signal.computeQrl!, container), () => {});
              }
            })
          )
        )
      );
    }
    case TypeIds.SerializerSignal: {
      const signal = target as SerializerSignal<unknown, unknown>;
      const d = data as unknown[];
      const subscriberOffset = 6;
      return maybeThen(deserializeData(container, d[0] as TypeIds, d[1]), (qrl) =>
        maybeThen(deserializeData(container, d[2] as TypeIds, d[3]), (deps) =>
          maybeThen(deserializeData(container, d[4] as TypeIds, d[5]), (value) => {
            if (rejectDisposedInflation(signal)) {
              return;
            }
            signal.argQrl = qrl as SerializerSignal<unknown, unknown>['argQrl'];
            restoreDependencies(signal, deps as Source[]);
            signal.v = value;
            signal.flags = ComputedFlags.HasValue;
            signal.didInitialize = false;
            if (d.length > subscriberOffset) {
              restoreSourceSubs(signal, container, d, subscriberOffset);
            }
            return maybeThen(getFunctionOrResolve(signal.argQrl!, container), () => {});
          })
        )
      );
    }
    case TypeIds.Store: {
      const raw = unwrapStore(target as object) as object;
      const pending = pendingStoreTargets.get(raw);
      const d = data as unknown[];
      // a deduped raw may be another root mid-inflation; its paths are walkable only after
      const inflatedRaw = pending
        ? inflate(container, raw, pending.t, pending.v)
        : container.state.inflatingRoots?.get(raw);
      pendingStoreTargets.delete(raw);
      return maybeThen(inflatedRaw, () => {
        if (d.length > 2) {
          return restoreStoreSources(container, raw, d[2] as TypeIds, d[3]);
        }
      });
    }
    case TypeIds.StoreProp: {
      const source = target as StorePropSource;
      const d = data as unknown[];
      return maybeThen(deserializeData(container, d[0] as TypeIds, d[1]), (rootId) =>
        maybeThen(container.getRoot(rootId as number | string), (target) =>
          maybeThen(deserializeData(container, d[2] as TypeIds, d[3]), (prop) => {
            bindStoreSource(source, target as object, prop as PropertyKey);
          })
        )
      );
    }
    case TypeIds.PropSource: {
      const source = target as PropSource;
      const d = data as unknown[];
      return maybeThen(deserializeData(container, d[0] as TypeIds, d[1]), (rootId) =>
        maybeThen(container.getRoot(rootId as number | string), (props) =>
          maybeThen(deserializeData(container, d[2] as TypeIds, d[3]), (key) => {
            source.props = props as object;
            source.key = key as string;
          })
        )
      );
    }
    case TypeIds.FormData: {
      const formData = target as FormData;
      const d = data as any[];
      for (let i = 0; i < d.length; i++) {
        formData.append(d[i++], d[i]);
      }
      break;
    }
    case TypeIds.Error: {
      const d = data as unknown[];
      (target as Error).message = String(d[0]);
      for (let i = 1; i < d.length; i += 2) {
        const key = d[i];
        const value = d[i + 1];
        if (isSafeObjectKV(key, value)) {
          (target as Record<string, unknown>)[key] = value;
        }
      }
      break;
    }
    case TypeIds.Set: {
      const set = target as Set<unknown>;
      const d = data as any[];
      for (let i = 0; i < d.length; i++) {
        set.add(d[i]);
      }
      break;
    }
    case TypeIds.Map: {
      const map = target as Map<unknown, unknown>;
      const d = data as any[];
      for (let i = 0; i < d.length; i++) {
        map.set(d[i++], d[i]);
      }
      break;
    }
    case TypeIds.ContextScope: {
      const scope = target as ContextScope;
      const d = data as unknown[];
      scope.parent = (d[0] as ContextScope | null) ?? null;
      for (let i = 1; i < d.length; i += 2) {
        scope.values.set(d[i] as string, d[i + 1]);
      }
      break;
    }
    case TypeIds.SlotScope: {
      const scope = target as SlotScope;
      const d = data as unknown[];
      scope.projections = d[0] as Projection[];
      scope.slotContentQrl = (d[1] as SlotScope['slotContentQrl']) ?? null;
      scope.children = (d[2] as SlotScope['children']) ?? null;
      break;
    }
    case TypeIds.Owner: {
      const values = data as unknown[];
      const [parent, position] = values;
      const shows = values.length === 2 ? false : values[2];
      if (
        (values.length !== 2 && values.length !== 3) ||
        (parent !== null && !(parent instanceof Owner)) ||
        !Number.isSafeInteger(position) ||
        (position as number) < 0 ||
        typeof shows !== 'boolean'
      ) {
        throw new Error('Invalid serialized owner');
      }
      const owner = target as Owner;
      owner.flags |= shows
        ? OwnerFlags.ShowsProjection | OwnerFlags.ResumeProjection
        : OwnerFlags.None;
      return maybeThen(parent === null ? null : whenRootInflated(container, parent), () => {
        if (parent !== null) {
          if (isResumeOwnerClosed(parent)) {
            disposeOwner(owner);
          } else {
            registerOwnerToOwner(owner, parent);
            restoreOwnerItemOrder(owner, parent, position as number);
          }
        }
      });
      break;
    }
    case TypeIds.Projection: {
      const projection = target as Projection;
      const d = data as unknown[];
      if (d.length !== 2 && d.length !== 4) {
        throw new Error('Invalid serialized projection');
      }
      projection.name = d[0] as Projection['name'];
      if (d.length === 4) {
        projection.renderQrl = d[1];
        projection.slotScope = (d[2] as SlotScope | null) ?? null;
        projection.host = readOwner(d[3]);
        projection.subscription = null;
      } else {
        const subscription = d[1];
        if (!(subscription instanceof ProjectionSubscription)) {
          throw new Error('Invalid serialized projection subscription');
        }
        projection.subscription = subscription;
        return maybeThen(whenRootInflated(container, subscription), () => {
          projection.host = subscription.owner;
          if (subscription.block !== null) {
            projection.renderQrl = subscription.block.fn;
            projection.slotScope = subscription.block.invokeContext?.slotScope ?? null;
          }
        });
      }
      break;
    }
    case TypeIds.Promise: {
      const promise = (target as PromiseRoot).promise;
      const [resolved, result] = data as [boolean, unknown];
      const [resolve, reject] = resolvers.get(promise)!;
      if (resolved) {
        if (resolvers.has(result as Promise<unknown>)) {
          throw qError(QError.invalidPromiseDependency);
        }
        resolve(result);
      } else {
        reject(result);
      }
      break;
    }
    case TypeIds.Uint8Array:
      const bytes = target as Uint8Array;
      const buf = atob(data as string);
      let i = 0;
      for (let j = 0; j < buf.length; j++) {
        const s = buf[j];
        bytes[i++] = s.charCodeAt(0);
      }
      break;
    case TypeIds.EffectSubscription:
    case TypeIds.SuspenseSubscription: {
      const parts = data as unknown[];
      const kind = parts[0] as EffectKind;
      const restoreUnderBoundary = (restore: () => Promise<void>, boundaryId: unknown) =>
        maybeThen(restorePendingBoundary(container, boundaryId), () => {
          return restore();
        });
      switch (kind) {
        case EffectKind.Branch:
          return restoreUnderBoundary(
            () =>
              restoreBranchSubscription(container, target as Writeable<BranchSubscription>, parts),
            parts[10]
          );
        case EffectKind.ForBlock:
          return restoreUnderBoundary(
            () =>
              restoreForBlockSubscription(
                container,
                target as Writeable<ForBlockSubscription>,
                parts
              ),
            parts[parts[5] === IndexMode.Escapes ? 11 : 10]
          );
        case EffectKind.Content:
        case EffectKind.Projection:
          return restoreUnderBoundary(
            () =>
              restoreContentSubscription(
                container,
                target as Writeable<ContentSubscription>,
                parts
              ),
            parts[kind === EffectKind.Projection ? 7 : 10]
          );
        case EffectKind.TextNode:
        case EffectKind.TextExpression:
        case EffectKind.Attr:
        case EffectKind.AttrExpression:
        case EffectKind.Props:
        case EffectKind.Event: {
          return maybeThen(restorePendingBoundary(container, getPendingRootId(parts)), () =>
            restoreDomEffect(container, target as Writeable<DomEffect>, parts)
          );
        }
        case EffectKind.DomBatch: {
          return maybeThen(restorePendingBoundary(container, getPendingRootId(parts)), () =>
            restoreDomBatchEffect(container, target as Writeable<DomBatchEffect>, parts)
          );
        }
        default:
          throw qError(QError.serializeErrorNotImplemented, [kind]);
      }
      break;
    }
    case TypeIds.Task: {
      const parts = data as unknown[];
      return maybeThen(restorePendingBoundary(container, getPendingRootId(parts)), () => {
        const phase = parts[0];
        const qrl = parts[1] as TaskQrlRef;
        const deps = parts[2] as Source[];
        const subscription = target as TaskSubscription | VisibleTaskSubscription;
        switch (phase) {
          case Phase.BlockingTask:
          case Phase.DeferredTask:
            if (!(subscription instanceof TaskSubscription)) {
              throw new Error(`Invalid task subscription for phase ${phase}.`);
            }
            (subscription as Writeable<TaskSubscription>).task = new Task(
              undefined,
              phase,
              qrl,
              container
            );
            break;
          case Phase.VisibleTask:
            if (!(subscription instanceof VisibleTaskSubscription)) {
              throw new Error(`Invalid task subscription for phase ${phase}.`);
            }
            (subscription as Writeable<VisibleTaskSubscription>).task = new VisibleTask(
              undefined,
              qrl,
              container
            );
            break;
          default:
            throw new Error(`Invalid serialized task phase ${String(phase)}.`);
        }
        restoreDependencies(subscription, deps);
      });
    }
    default:
      throw qError(QError.serializeErrorNotImplemented, [typeId]);
  }
};

async function restoreBranchSubscription(
  container: ContainerContext,
  subscription: Writeable<BranchSubscription>,
  parts: unknown[]
): Promise<void> {
  const rangeId = parts[1] as number;
  const mountedBranch = parts[2] == null ? undefined : (parts[2] as 0 | 1);
  const deps = parts[3] as Source[];
  const conditionQrl = parts[4] as QRLInternal<() => boolean>;
  const thenQrl = parts[5] as QRLInternal<(ctx: ContainerContext) => readonly Node[]>;
  const elseQrl =
    (parts[6] as QRLInternal<(ctx: ContainerContext) => readonly Node[]> | null) ?? undefined;
  const owner = readOwner(parts[7]);
  const slotScope = (parts[8] as SlotScope | null | undefined) ?? null;
  const useOnScopes = parts[9] as UseOnMap[] | null | undefined;
  const markerRange = findContainerNode(container, (root) => findBranchRange(root, rangeId));
  isDev && assertDefined(markerRange, `Missing branch range ${rangeId}.`);
  if (markerRange === null) {
    throw new Error(`Missing branch range ${rangeId}.`);
  }

  const invokeContext = await restoreInvokeContext(container, markerRange[0], subscription.owner);
  invokeContext.slotScope = slotScope;
  restoreUseOnScopes(invokeContext, useOnScopes);
  subscription.branch = new Branch(
    new BranchRange(container.document, markerRange[0], markerRange[1]),
    conditionQrl,
    thenQrl,
    elseQrl,
    mountedBranch ?? null,
    invokeContext,
    container,
    useOnScopes != null
  );
  restoreDependencies(subscription as BranchSubscription, deps);

  if (owner !== null) {
    subscription.branch.currentOwner = owner;
  }
}

async function restoreForBlockSubscription(
  container: ContainerContext,
  subscription: Writeable<ForBlockSubscription>,
  parts: unknown[]
): Promise<void> {
  const rangeId = parts[1] as number;
  const deps = parts[2] as Source[];
  const keyQrl = parts[3] as QRLInternal<(item: unknown, index: number) => string | number>;
  const renderQrl = parts[4] as QRLInternal<
    (ctx: ContainerContext, item: unknown, index: unknown) => readonly Node[]
  >;
  const indexMode = parts[5] as IndexMode;
  const slotScope = (parts[6] as SlotScope | null | undefined) ?? null;
  const rowOwners = (parts[7] as Array<Owner | null> | null | undefined) ?? null;
  if (rowOwners !== null) {
    if (!Array.isArray(rowOwners)) {
      throw new Error('Invalid serialized row owners');
    }
    for (const rowOwner of rowOwners) {
      readOwner(rowOwner);
    }
  }
  const hasIndexSignals = indexMode === IndexMode.Escapes;
  const indexSignals = hasIndexSignals ? (parts[10] as Array<ReactiveSignal<number> | null>) : null;
  const rowShape = (parts[8] as 0 | 1 | 2 | 3 | null | undefined) ?? 3;
  const markerRange = findContainerNode(container, (root) => findForRange(root, rangeId));
  isDev && assertDefined(markerRange, `Missing for range ${rangeId}.`);
  if (markerRange === null) {
    throw new Error(`Missing for range ${rangeId}.`);
  }
  if (!Array.isArray(deps) || deps.length === 0) {
    throw new Error('ForBlock subscription requires a source dependency.');
  }

  const listOwner = parts[9];
  if (!(listOwner instanceof Owner)) {
    throw new Error('Missing serialized list owner');
  }
  const invokeContext = await restoreInvokeContext(container, markerRange[0], subscription.owner);
  invokeContext.slotScope = slotScope;
  const block = new ForBlock(
    new ForRange(container.document, markerRange[0], markerRange[1]),
    deps[0] as Source<readonly unknown[]>,
    keyQrl,
    renderQrl,
    indexMode,
    listOwner,
    invokeContext,
    container,
    rowShape
  );
  // The rows SSR rendered are still in the DOM; their markers carry the keys resume adopts.
  block.resumed = false;
  block.resumeOwners = rowOwners;
  block.resumeIndexSignals = indexSignals;

  subscription.block = block;
  restoreDependencies(subscription, deps);
}

async function restoreContentSubscription(
  container: ContainerContext,
  subscription: Writeable<ContentSubscription>,
  parts: unknown[]
): Promise<void> {
  const rangeId = parts[1] as number;
  const deps = parts[2] as Source[];
  const isProjection = subscription instanceof ProjectionSubscription;
  const args = isProjection ? EMPTY_ARRAY : (parts[3] as unknown[]);
  const qrlIndex = isProjection ? 3 : 4;
  const renderQrl = parts[qrlIndex] as QRLInternal<
    (...args: unknown[]) => ValueOrPromise<ContentOutput>
  >;
  const owner = readOwner(parts[qrlIndex + 1]);
  const slotScope = (parts[qrlIndex + 2] as SlotScope | null | undefined) ?? null;
  const useOnScopes = isProjection ? null : (parts[7] as UseOnMap[] | null | undefined);
  const contextArg = isProjection || parts[8] === true;
  const suspense = (parts[0] === EffectKind.Projection ? undefined : parts[9]) as
    | [Parameters<typeof attachSuspense>[4] | null, number]
    | null
    | undefined;
  const markerRange = findContainerNode(container, (root) =>
    isProjection ? findProjectionRange(root, rangeId) : findContentRange(root, rangeId)
  );
  isDev && assertDefined(markerRange, `Missing content range ${rangeId}.`);
  if (markerRange === null) {
    throw new Error(`Missing content range ${rangeId}.`);
  }

  const invokeContext = await restoreInvokeContext(container, markerRange[0], subscription.owner);
  invokeContext.slotScope = slotScope;
  restoreUseOnScopes(invokeContext, useOnScopes);
  const Block = isProjection ? ProjectionBlock : ContentBlock;
  subscription.block = new Block(
    container.document,
    markerRange[0],
    markerRange[1],
    args as [],
    renderQrl,
    invokeContext,
    container,
    useOnScopes != null,
    contextArg,
    true
  );
  restoreDependencies(subscription, deps);

  if (owner !== null) {
    subscription.block.currentOwner = owner;
  } else if (suspense != null) {
    subscription.block.currentOwner = createOwner(subscription.owner);
  }
  if (isProjection) {
    const block = subscription.block as ProjectionBlock;
    block.host = subscription.owner;
    block.setRenderOwner(readOwner(parts[6]));
  }
  if (suspense != null) {
    if (!(subscription instanceof SuspenseContentSubscription)) {
      throw new Error('Suspense data requires a suspense subscription.');
    }
    attachSuspense(
      container,
      new BranchRange(container.document, markerRange[0], markerRange[1]),
      subscription,
      EMPTY_NODES,
      suspense[0] ?? undefined,
      suspense[1]
    );
  } else if (subscription instanceof SuspenseContentSubscription) {
    throw new Error('Suspense subscription requires suspense data.');
  }
}

async function restoreInvokeContext(
  container: ContainerContext,
  node: Node,
  owner: Owner | null
): Promise<RuntimeInvokeContext> {
  return newInvokeContext({
    container,
    contextScope: (await getContextScopeForNode(container, node, owner)) as ContextScope | null,
  });
}

function restoreUseOnScopes(
  context: RuntimeInvokeContext,
  scopes: UseOnMap[] | null | undefined
): void {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return;
  }
  context.useOnEvents = scopes[0];
  if (scopes.length > 1) {
    context.inheritedUseOnEvents = scopes.slice(1);
  }
}

/** A source read before its subs record inflates already has live subscribers to keep. */
function restoreSourceSubs(
  source: Source,
  container: ContainerContext,
  data: unknown[],
  start: number
): void {
  const live = source.subs;
  source.subs = createLazySourceSubscribers(source, container, data, start);
  if (live === null) {
    return;
  }
  const liveSubs = Array.isArray(live) ? live : [live];
  for (let i = 0; i < liveSubs.length; i++) {
    appendSourceSubscriber(source, liveSubs[i]);
  }
}

function createLazySourceSubscribers(
  source: Source,
  container: ContainerContext,
  data: unknown[],
  start: number
): SourceSub[] {
  return createLazySourceSubs((data.length - start) / 2, (index) => {
    const i = start + index * 2;
    const typeId = data[i] as TypeIds;
    const value = data[i + 1];
    if (typeId === TypeIds.Plain) {
      return value as Subscriber;
    }
    return lazySubscriber(container, async () => {
      const subscriber = (await deserializeData(container, typeId, value)) as Subscriber;
      data[i] = TypeIds.Plain;
      data[i + 1] = subscriber;
      return subscriber;
    });
  });
}

function restoreStoreSources(
  container: ContainerContext,
  raw: object,
  typeId: TypeIds,
  data: unknown
): ValueOrPromise<void> {
  if (typeId !== TypeIds.Array && typeId !== TypeIds.BigArray) {
    return;
  }
  const records = data as unknown[];
  let i = 0;
  const restoreNext = (): ValueOrPromise<void> => {
    while (i < records.length) {
      const recordType = records[i] as TypeIds;
      const record = records[i + 1] as unknown[];
      i += 2;
      if (recordType !== TypeIds.Array || !Array.isArray(record) || record.length < 2) {
        continue;
      }
      const start = record.length >= 4 && record[0] === TypeIds.Array ? 4 : 2;
      const path = start === 4 ? deserializeData(container, record[0] as TypeIds, record[1]) : [];
      return maybeThen(path, (path) =>
        maybeThen(
          deserializeData(container, record[start - 2] as TypeIds, record[start - 1]),
          (prop) => {
            let target = raw as Record<PropertyKey, unknown>;
            for (let j = 0; j < (path as unknown[]).length; j++) {
              const nested = target[(path as unknown[])[j] as PropertyKey];
              // Removed rows can disappear before their lazy sources inflate.
              if (nested === null || typeof nested !== 'object') {
                return restoreNext();
              }
              target = nested as Record<PropertyKey, unknown>;
            }
            const source = getStoreSource(
              unwrapStore(target as object) as object,
              prop as PropertyKey
            );
            restoreSourceSubs(source, container, record, start);
            return restoreNext();
          }
        )
      );
    }
  };
  return restoreNext();
}

function getPendingRootId(parts: unknown[]): number | undefined {
  const last = parts.length - 1;
  return parts[last - 1] === null && typeof parts[last] === 'number'
    ? (parts[last] as number)
    : undefined;
}

function restorePendingBoundary(
  container: ContainerContext,
  boundaryId: unknown
): ValueOrPromise<void> {
  return maybeThen(
    typeof boundaryId === 'number' ? container.getRoot(boundaryId) : undefined,
    (boundary) => {
      if (boundaryId !== undefined && !(boundary instanceof SuspenseContentSubscription)) {
        throw new Error('Pending owner requires a suspense subscription.');
      }
    }
  );
}

async function restoreDomEffect(
  container: ContainerContext,
  effect: Writeable<DomEffect>,
  parts: unknown[]
): Promise<void> {
  const deps = await populateDomEffect(container, effect, parts);
  if (deps === null) {
    // Its element is gone, so the effect can never run.
    return;
  }
  restoreDependencies(effect, deps);
}

async function restoreDomBatchEffect(
  container: ContainerContext,
  batch: Writeable<DomBatchEffect>,
  parts: unknown[]
): Promise<void> {
  const deps = parts[1] as Source[];
  const effectParts = parts[2] as unknown[][];
  const effects: DomEffect[] = [];

  for (let i = 0; i < effectParts.length; i++) {
    const effectPartsAtIndex = effectParts[i];
    const effect = allocateDomEffect(container, effectPartsAtIndex[0] as EffectKind);
    if ((await populateDomEffect(container, effect, effectPartsAtIndex)) !== null) {
      effects.push(effect);
    }
  }

  batch.fn = () => {
    let pending: Promise<void>[] | undefined;
    for (let i = 0; i < effects.length; i++) {
      const value = effects[i].execute();
      if (isPromise(value)) {
        (pending ??= []).push(value);
      }
    }
    return pending === undefined ? undefined : Promise.all(pending).then(() => undefined);
  };
  restoreDependencies(batch, deps);
}

/** Null when the effect's element is gone: a removed subtree leaves its serialized effects behind. */
async function populateDomEffect(
  container: ContainerContext,
  effect: Writeable<DomEffect>,
  parts: unknown[]
): Promise<Source[] | null> {
  const kind = parts[0] as EffectKind;
  switch (kind) {
    case EffectKind.TextNode: {
      const target = readDomEffectTarget(parts, true);
      const text = resolveTextTarget(
        container,
        target.targetKind,
        target.targetId,
        target.markerIndex
      );
      if (text === null) {
        return null;
      }
      const source = readRequiredSource(target.deps) as Source<TextExpressionValue>;
      const stringify = parts[target.depsIndex + 1] === 1;
      const textEffect = effect as Writeable<TextNodeEffect>;
      textEffect.text = text;
      textEffect.source = source;
      textEffect.stringify = stringify;
      return target.deps;
    }
    case EffectKind.TextExpression: {
      const target = readDomEffectTarget(parts, true);
      const text = resolveTextTarget(
        container,
        target.targetKind,
        target.targetId,
        target.markerIndex
      );
      if (text === null) {
        return null;
      }
      const qrl = parts[target.depsIndex + 2] as QRLInternal<TextExpressionFn>;
      const args = parts[target.depsIndex + 1] as unknown[];
      const fn = await qrl.resolve();
      const textEffect = effect as Writeable<TextExpressionEffect>;
      textEffect.text = text;
      textEffect.args = args;
      textEffect.fn = fn;
      return target.deps;
    }
    case EffectKind.Attr: {
      const target = readDomEffectTarget(parts);
      const element = resolveElementTarget(container, target.targetKind, target.targetId);
      if (element === null) {
        return null;
      }
      const name = String(parts[target.depsIndex + 1]);
      const source = readRequiredDomSource(target.deps, target.targetKind);
      const styleScopedId = parts[target.depsIndex + 2] as string | null;
      const attrEffect = effect as Writeable<AttrEffect>;
      attrEffect.element = element;
      attrEffect.name = name;
      attrEffect.source = source;
      attrEffect.styleScopedId = styleScopedId ?? undefined;
      return target.deps;
    }
    case EffectKind.AttrExpression: {
      const target = readDomEffectTarget(parts);
      const element = resolveElementTarget(container, target.targetKind, target.targetId);
      if (element === null) {
        return null;
      }
      const name = String(parts[target.depsIndex + 1]);
      const args = parts[target.depsIndex + 2] as unknown[];
      const qrl = parts[target.depsIndex + 3] as QRLInternal<AttrExpressionFn>;
      const styleScopedId = parts[target.depsIndex + 4] as string | null;
      const fn = await qrl.resolve();
      const attrEffect = effect as Writeable<AttrExpressionEffect>;
      attrEffect.element = element;
      attrEffect.name = name;
      attrEffect.args = args;
      attrEffect.fn = fn;
      attrEffect.styleScopedId = styleScopedId ?? undefined;
      return target.deps;
    }
    case EffectKind.Props: {
      const target = readDomEffectTarget(parts);
      const element = resolveElementTarget(container, target.targetKind, target.targetId);
      if (element === null) {
        return null;
      }
      const qrl = parts[target.depsIndex + 2] as QRLInternal<
        (...args: unknown[]) => Record<string, unknown> | null | undefined
      >;
      const args = parts[target.depsIndex + 1] as unknown[];
      const styleScopedId = parts[target.depsIndex + 3] as string | null;
      const fn = await qrl.resolve();
      const propsEffect = effect as Writeable<PropsEffect>;
      propsEffect.element = element;
      propsEffect.args = args;
      propsEffect.fn = fn;
      propsEffect.styleScopedId = styleScopedId ?? undefined;
      return target.deps;
    }
    case EffectKind.Event: {
      const target = readDomEffectTarget(parts);
      const element = resolveElementTarget(container, target.targetKind, target.targetId);
      if (element === null) {
        return null;
      }
      const name = String(parts[target.depsIndex + 1]);
      const args = parts[target.depsIndex + 2] as unknown[];
      const qrl = parts[target.depsIndex + 3] as QRLInternal<(...args: unknown[]) => unknown>;
      const before = parts[target.depsIndex + 4] as QDispatchHandler[];
      const after = parts[target.depsIndex + 5] as QDispatchHandler[];
      const fn = await qrl.resolve();
      const eventEffect = effect as Writeable<EventEffect>;
      eventEffect.element = element;
      eventEffect.name = name;
      eventEffect.args = args;
      eventEffect.fn = fn;
      eventEffect.before = before;
      eventEffect.after = after;
      return target.deps;
    }
    default:
      throw qError(QError.serializeErrorNotImplemented, [kind]);
  }
}

function readDomEffectTarget(
  parts: unknown[],
  isText = false
): {
  targetKind: EffectTargetKind;
  targetId: number;
  markerIndex: number | undefined;
  depsIndex: number;
  deps: Source[];
} {
  const targetKind = isText ? (parts[1] as EffectTargetKind) : EffectTargetKind.Element;
  const targetId = parts[isText ? 2 : 1] as number;
  const isRangeText = targetKind === EffectTargetKind.RangeText;
  const markerIndex = isRangeText ? (parts[3] as number) : undefined;
  const depsIndex = isText ? (isRangeText ? 4 : 3) : 2;
  const deps = parts[depsIndex] as Source[];
  return { targetKind, targetId, markerIndex, depsIndex, deps };
}

function readRequiredDomSource(deps: Source[], targetKind: EffectTargetKind): Source {
  if (targetKind !== EffectTargetKind.Element) {
    throw new Error(`Unsupported element target kind ${targetKind}.`);
  }
  return readRequiredSource(deps);
}

function readRequiredSource(deps: Source[]): Source {
  if (!Array.isArray(deps) || deps.length === 0) {
    throw new Error('DOM subscription requires a source dependency.');
  }
  return deps[0];
}

function resolveElementTarget(
  container: ContainerContext,
  targetKind: EffectTargetKind,
  elementId: number
): Element | null {
  if (targetKind !== EffectTargetKind.Element) {
    throw new Error(`Unsupported element target kind ${targetKind}.`);
  }
  return findContainerNode(container, (root) => findQwikElement(root, elementId));
}

function resolveTextTarget(
  container: ContainerContext,
  targetKind: EffectTargetKind,
  elementId: number,
  markerIndex: number | undefined
): Text | null {
  const element = findContainerNode(container, (root) => findQwikElement(root, elementId));

  if (targetKind === EffectTargetKind.ElementText) {
    if (element == null) {
      return null;
    }
    return findElementText(element);
  }
  if (targetKind === EffectTargetKind.RangeText) {
    isDev && assertNumber(markerIndex, `Missing range text marker index for element ${elementId}.`);
    if (element == null) {
      // a branch range lives between markers, not inside an element
      return resolveBranchTextTarget(container, elementId, markerIndex!);
    }
    const text = findTextNode(element, markerIndex!);
    isDev && assertDefined(text, `Missing range text target ${elementId}:${markerIndex}.`);
    return text!;
  }
  throw new Error(`Unsupported text target kind ${targetKind}.`);
}

function resolveBranchTextTarget(
  container: ContainerContext,
  rangeId: number,
  markerIndex: number
): Text | null {
  const range = findContainerNode(container, (root) => findBranchTextRange(root, rangeId));
  return range === null ? null : findBranchTextNode(range, markerIndex);
}

function restoreDependencies(
  collector:
    | DomSubscriber
    | BranchSubscription
    | ForBlockSubscription
    | ContentSubscription
    | TaskSubscriber
    | VisibleTaskSubscriber
    | ComputedSubscriber<unknown>
    | AsyncSignal<unknown>
    | SerializerSignal<unknown, unknown>,
  deps: Source[]
) {
  if (
    isSubscriberDisposed(collector) ||
    (collector.owner !== null && isResumeOwnerClosed(collector.owner))
  ) {
    return;
  }
  if (deps && deps.length > 0) {
    collector.deps = [];
    for (let i = 0; i < deps.length; i++) {
      addDependency(collector, deps[i]);
    }
  }
}

/**
 * Restores an array eagerly. If you need it lazily, use `deserializeData(container, TypeIds.Array,
 * array)` instead
 */
const _eagerDeserializeArray = (
  container: ContainerContext,
  data: unknown[],
  output: unknown[] = Array(data.length / 2)
): ValueOrPromise<unknown[]> => {
  let i = 0;
  const drain = (): ValueOrPromise<unknown[]> => {
    while (i < data.length) {
      const index = i;
      const value = deserializeData(container, data[index] as TypeIds, data[index + 1]);
      i += 2;
      if (isPromise(value)) {
        return value.then((value) => {
          output[index / 2] = unwrapPromiseRoot(value);
          return drain();
        });
      }
      output[index / 2] = unwrapPromiseRoot(value);
    }
    return output;
  };
  return drain();
};

export function deserializeData(
  container: ContainerContext,
  typeId: number,
  value: unknown
): ValueOrPromise<unknown> {
  if (typeId === TypeIds.Plain) {
    return value;
  }
  return maybeThen(allocate(container, typeId, value), (propValue) => {
    if (needsInflation(typeId)) {
      return maybeThen(inflate(container, propValue, typeId, value), () => propValue);
    }
    return propValue;
  });
}
