import { isDev } from '@qwik.dev/core/build';
import { NEEDS_COMPUTATION } from '../../reactive/constants';
import type { AsyncSignalOptions } from '../../reactive/public-types';
import { Branch, BranchRange, BranchSubscription } from '../../dom/branch/branch';
import { ContentBlock, ContentSubscription } from '../../dom/content/content';
import { ForBlock, ForRange } from '../../dom/for/for';
import {
  AttrEffect,
  AttrExpressionEffect,
  DomBatchEffect,
  ForBlockSubscription,
  PropsEffect,
  type AttrExpressionFn,
} from '../../dom/effect/effect';
import type { DomEffect } from '../../dom/effect/dom-subscription';
import {
  TextExpressionEffect,
  TextNodeEffect,
  type TextExpressionFn,
  type TextExpressionValue,
} from '../../dom/effect/text-effect';
import { EffectKind } from '../../dom/effect/effect-kind.enum';
import { EffectTargetKind } from '../../dom/effect/ssr-effect';
import { ComputedFlags } from '../../reactive/flags';
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
import { readSourceValue, type Source, type SourceSub } from '../../reactive/source';
import { addDependency } from '../../reactive/tracking';
import { getContextScopeForNode, type ContainerContext } from '../../runtime/container-context';
import type { ContextScope } from '../../runtime/context-scope';
import { newInvokeContext, type RuntimeInvokeContext } from '../../runtime/invoke-context';
import type { UseOnMap } from '../../runtime/use-on';
import type { Projection, SlotScope } from '../../dom/slot/slot';
import { createOwner, registerSubscriberToOwner } from '../../runtime/owner';
import { Phase } from '../../runtime/scheduler';
import { Task, TaskSubscription, type TaskQrlRef } from '../../runtime/task';
import {
  findBranchRange,
  findBranchTextNode,
  findContentRange,
  findElementText,
  findForRange,
  findForRowRange,
  findQwikElement,
  findSlotRange,
  findTextNode,
} from '../../runtime/node-walker';
import {
  SubscriberKind,
  type ComputedSubscriber,
  type DomSubscriber,
  type Subscriber,
  type TaskSubscriber,
} from '../../runtime/subscriber';
import { getFunctionOrResolve } from '../../utils/qrl';
import type { MaybeNodeOutput } from '../../utils/nodes';
import { assertDefined, assertNumber } from '../error/assert';
import { qError, QError } from '../error/error';
import { withCaptures } from '../qrl/qrl-captures';
import type { QRLInternal } from '../qrl/qrl-class';
import { isPromise, maybeThen } from '../utils/promises';
import type { ValueOrPromise } from '../utils/types';
import { allocate, pendingStoreTargets, resolvers } from './allocate';
import { EMPTY_OBJECT_PAYLOAD, TypeIds } from './constants';
import { needsInflation } from './deser-proxy';

export { allocate, needsInflation };

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

export const inflate = (
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
    typeId !== TypeIds.ComputedSignal &&
    typeId !== TypeIds.AsyncSignal &&
    typeId !== TypeIds.SerializerSignal &&
    Array.isArray(data)
  ) {
    return maybeThen(_eagerDeserializeArray(container, data), (data) =>
      inflateResolved(container, target, typeId, data)
    );
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
        signal.v = value;
        if (d.length > 2) {
          signal.subs = createLazySourceSubscribers(signal, container, d, 2);
        }
      });
    }
    case TypeIds.ComputedSignal: {
      const computed = target as Writeable<ComputedQrl<unknown>>;
      ensureDeserializedOwner(computed);
      const d = data as unknown[];
      return maybeThen(deserializeData(container, d[0] as TypeIds, d[1]), (qrl) =>
        maybeThen(deserializeData(container, d[2] as TypeIds, d[3]), (deps) =>
          maybeThen(deserializeData(container, d[4] as TypeIds, d[5]), (value) => {
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
              computed.subs = createLazySourceSubscribers(computed, container, d, 6);
            }
          })
        )
      );
    }
    case TypeIds.AsyncSignal: {
      const signal = target as AsyncSignal<unknown>;
      ensureDeserializedOwner(signal);
      const d = data as unknown[];
      const subscriberOffset = 8;
      return maybeThen(deserializeData(container, d[0] as TypeIds, d[1]), (qrl) =>
        maybeThen(deserializeData(container, d[2] as TypeIds, d[3]), (deps) =>
          maybeThen(deserializeData(container, d[4] as TypeIds, d[5]), (value) =>
            maybeThen(deserializeData(container, d[6] as TypeIds, d[7]), (options) => {
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
                signal.subs = createLazySourceSubscribers(signal, container, d, subscriberOffset);
              }
            })
          )
        )
      );
    }
    case TypeIds.SerializerSignal: {
      const signal = target as SerializerSignal<unknown, unknown>;
      ensureDeserializedOwner(signal);
      const d = data as unknown[];
      const subscriberOffset = 8;
      return maybeThen(deserializeData(container, d[0] as TypeIds, d[1]), (qrl) =>
        maybeThen(deserializeData(container, d[2] as TypeIds, d[3]), (deps) =>
          maybeThen(deserializeData(container, d[4] as TypeIds, d[5]), (value) =>
            maybeThen(deserializeData(container, d[6] as TypeIds, d[7]), (initialized) => {
              signal.argQrl = qrl as SerializerSignal<unknown, unknown>['argQrl'];
              restoreDependencies(signal, deps as Source[]);
              signal.v = initialized ? (value as unknown) : NEEDS_COMPUTATION;
              signal.flags = ComputedFlags.HasValue;
              signal.didInitialize = false;
              if (d.length > subscriberOffset) {
                signal.subs = createLazySourceSubscribers(signal, container, d, subscriberOffset);
              }
              return maybeThen(getFunctionOrResolve(signal.argQrl!, container), () => {});
            })
          )
        )
      );
    }
    case TypeIds.Store: {
      const raw = unwrapStore(target as object) as object;
      const pending = pendingStoreTargets.get(raw);
      const d = data as unknown[];
      const inflatedRaw = pending ? inflate(container, raw, pending.t, pending.v) : undefined;
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
      for (let i = 0; i < d.length; i += 2) {
        scope.slots.set(d[i] as string, d[i + 1] as Projection[]);
      }
      break;
    }
    case TypeIds.Projection: {
      const projection = target as Projection;
      const d = data as unknown[];
      projection.renderQrl = d[0];
      projection.owner = null;
      projection.nodes = null;
      projection.slotScope = (d[1] as SlotScope | null) ?? null;
      projection.idBase = (d[2] as string | null | undefined) ?? '';
      break;
    }
    case TypeIds.Promise: {
      const promise = target as Promise<unknown>;
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
    case TypeIds.EffectSubscription: {
      ensureDeserializedOwner(target as Subscriber);
      const parts = data as unknown[];
      const kind = parts[0] as EffectKind;
      switch (kind) {
        case EffectKind.Branch: {
          return restoreBranchSubscription(
            container,
            target as Writeable<BranchSubscription>,
            parts
          );
        }
        case EffectKind.ForBlock: {
          return restoreForBlockSubscription(
            container,
            target as Writeable<ForBlockSubscription>,
            parts
          );
        }
        case EffectKind.Content: {
          return restoreContentSubscription(
            container,
            target as Writeable<ContentSubscription>,
            parts
          );
        }
        case EffectKind.TextNode:
        case EffectKind.TextExpression:
        case EffectKind.Attr:
        case EffectKind.Props: {
          return restoreDomSubscription(container, target as Writeable<DomSubscriber>, parts);
        }
        case EffectKind.DomBatch: {
          return restoreDomBatchSubscription(container, target as Writeable<DomSubscriber>, parts);
        }
        default:
          throw qError(QError.serializeErrorNotImplemented, [kind]);
      }
      break;
    }
    case TypeIds.Task: {
      ensureDeserializedOwner(target as Subscriber);
      const subscription = target as Writeable<TaskSubscription>;
      const parts = data as unknown[];
      const phase = parts[0] as Phase.BlockingTask | Phase.DeferredTask;
      const qrl = parts[1] as TaskQrlRef;
      const deps = parts[2] as Source[];
      subscription.task = new Task(undefined, phase, qrl, container);
      restoreDependencies(subscription, deps);
      break;
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
  const ownedSubscribers = parts[7] as Subscriber[] | undefined;
  const slotScope = (parts[8] as SlotScope | null | undefined) ?? null;
  const useOnScopes = parts[9] as UseOnMap[] | null | undefined;
  const idBase = (parts[10] as string | null | undefined) ?? '';
  const markerRange = findBranchRange(container.element, rangeId);
  isDev && assertDefined(markerRange, `Missing branch range ${rangeId}.`);
  if (markerRange === null) {
    throw new Error(`Missing branch range ${rangeId}.`);
  }

  const invokeContext = await restoreInvokeContext(container, markerRange[0]);
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
    idBase,
    useOnScopes != null
  );
  restoreDependencies(subscription, deps);

  if (Array.isArray(ownedSubscribers) && ownedSubscribers.length > 0) {
    const owner = createOwner(subscription.owner);
    subscription.branch.currentOwner = owner;
    for (let i = 0; i < ownedSubscribers.length; i++) {
      registerSubscriberToOwner(ownedSubscribers[i], owner);
    }
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
  const usesIndexSignal = parts[5] as boolean;
  const slotScope = (parts[6] as SlotScope | null | undefined) ?? null;
  const useOnScopes = parts[7] as UseOnMap[] | null | undefined;
  const indexSignals =
    (parts[8] as Array<ReactiveSignal<number> | null> | null | undefined) ?? null;
  const idBase = (parts[9] as string | null | undefined) ?? '';
  const rowShape = (parts[10] as 0 | 1 | 2 | 3 | null | undefined) ?? 3;
  const markerRange = findForRange(container.element, rangeId);
  isDev && assertDefined(markerRange, `Missing for range ${rangeId}.`);
  if (markerRange === null) {
    throw new Error(`Missing for range ${rangeId}.`);
  }
  if (!Array.isArray(deps) || deps.length === 0) {
    throw new Error('ForBlock subscription requires a source dependency.');
  }

  const listOwner = createOwner(subscription.owner);
  const invokeContext = await restoreInvokeContext(container, markerRange[0]);
  invokeContext.slotScope = slotScope;
  restoreUseOnScopes(invokeContext, useOnScopes);
  const block = new ForBlock(
    new ForRange(container.document, markerRange[0], markerRange[1]),
    deps[0] as Source<readonly unknown[]>,
    keyQrl,
    renderQrl,
    usesIndexSignal,
    listOwner,
    invokeContext,
    container,
    idBase,
    rowShape
  );
  block.resumeItems = readSourceValue(deps[0] as Source<readonly unknown[]>) ?? [];
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
  const args = parts[3] as unknown[];
  const renderQrl = parts[4] as QRLInternal<
    (...args: unknown[]) => ValueOrPromise<MaybeNodeOutput>
  >;
  const ownedSubscribers = parts[5] as Subscriber[] | undefined;
  const slotScope = (parts[6] as SlotScope | null | undefined) ?? null;
  const useOnScopes = parts[7] as UseOnMap[] | null | undefined;
  const markerRange = findContentRange(container.element, rangeId);
  isDev && assertDefined(markerRange, `Missing content range ${rangeId}.`);
  if (markerRange === null) {
    throw new Error(`Missing content range ${rangeId}.`);
  }

  const invokeContext = await restoreInvokeContext(container, markerRange[0]);
  invokeContext.slotScope = slotScope;
  restoreUseOnScopes(invokeContext, useOnScopes);
  subscription.block = new ContentBlock(
    container.document,
    markerRange[0],
    markerRange[1],
    args,
    renderQrl,
    invokeContext,
    container,
    useOnScopes != null,
    true
  );
  restoreDependencies(subscription, deps);

  if (Array.isArray(ownedSubscribers) && ownedSubscribers.length > 0) {
    const owner = createOwner(subscription.owner);
    subscription.block.currentOwner = owner;
    for (let i = 0; i < ownedSubscribers.length; i++) {
      registerSubscriberToOwner(ownedSubscribers[i], owner);
    }
  }
}

async function restoreInvokeContext(
  container: ContainerContext,
  node: Node
): Promise<RuntimeInvokeContext> {
  return newInvokeContext({
    container,
    contextScope: (await getContextScopeForNode(container, node)) as ContextScope | null,
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

function createLazySourceSubscribers(
  source: Source,
  container: ContainerContext,
  data: unknown[],
  start: number
): SourceSub[] {
  const resumeItems = Array.isArray(source.v) ? source.v : null;
  return createLazySourceSubs((data.length - start) / 2, (index) => {
    const i = start + index * 2;
    const typeId = data[i] as TypeIds;
    const value = data[i + 1];
    if (typeId === TypeIds.Plain) {
      return value as Subscriber;
    }
    return new LazySerialized<Subscriber>(async () => {
      const subscriber = (await deserializeData(container, typeId, value)) as Subscriber;
      if (
        resumeItems !== null &&
        subscriber.kind === SubscriberKind.ForBlock &&
        'block' in subscriber
      ) {
        subscriber.block.resumeItems = resumeItems;
      }
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
              target = target[(path as unknown[])[j] as PropertyKey] as Record<
                PropertyKey,
                unknown
              >;
            }
            const source = getStoreSource(
              unwrapStore(target as object) as object,
              prop as PropertyKey
            );
            source.subs = createLazySourceSubscribers(source, container, record, start);
            return restoreNext();
          }
        )
      );
    }
  };
  return restoreNext();
}

function ensureDeserializedOwner(subscriber: Subscriber): void {
  if (subscriber.owner === null) {
    registerSubscriberToOwner(subscriber, createOwner(null));
  }
}

async function restoreDomSubscription(
  container: ContainerContext,
  subscription: Writeable<DomSubscriber>,
  parts: unknown[]
): Promise<void> {
  const restored = await restoreDomEffect(container, parts);
  subscription.effect = restored.effect;
  restoreDependencies(subscription, restored.deps);
}

async function restoreDomBatchSubscription(
  container: ContainerContext,
  subscription: Writeable<DomSubscriber>,
  parts: unknown[]
): Promise<void> {
  const deps = parts[1] as Source[];
  const effectParts = parts[2] as unknown[][];
  const effects: DomEffect[] = Array(effectParts.length);

  for (let i = 0; i < effectParts.length; i++) {
    effects[i] = (await restoreDomEffect(container, effectParts[i])).effect;
  }

  subscription.effect = new DomBatchEffect(() => {
    let pending: Promise<void>[] | undefined;
    for (let i = 0; i < effects.length; i++) {
      const value = effects[i].run();
      if (isPromise(value)) {
        (pending ??= []).push(value);
      }
    }
    return pending === undefined ? undefined : Promise.all(pending).then(() => undefined);
  });
  restoreDependencies(subscription, deps);
}

async function restoreDomEffect(
  container: ContainerContext,
  parts: unknown[]
): Promise<{ effect: DomEffect; deps: Source[] }> {
  const kind = parts[0] as EffectKind;
  switch (kind) {
    case EffectKind.TextNode: {
      const target = readDomSubscriptionTarget(parts);
      const text = resolveTextTarget(
        container,
        target.targetKind,
        target.targetId,
        target.markerIndex
      );
      const source = readRequiredSource(target.deps) as Source<TextExpressionValue>;
      return { deps: target.deps, effect: new TextNodeEffect(text, source) };
    }
    case EffectKind.TextExpression: {
      const target = readDomSubscriptionTarget(parts);
      const text = resolveTextTarget(
        container,
        target.targetKind,
        target.targetId,
        target.markerIndex
      );
      const qrl = parts[target.depsIndex + 2] as QRLInternal<TextExpressionFn>;
      const args = parts[target.depsIndex + 1] as unknown[];
      const fn = withCaptures(await qrl.resolve(), args);
      return {
        deps: target.deps,
        effect: new TextExpressionEffect(text, args, fn),
      };
    }
    case EffectKind.Attr: {
      const target = readDomSubscriptionTarget(parts);
      const element = resolveElementTarget(container, target.targetKind, target.targetId);
      const name = String(parts[target.depsIndex + 1]);
      if (parts.length > target.depsIndex + 3) {
        const args = parts[target.depsIndex + 2] as unknown[];
        const qrl = parts[target.depsIndex + 3] as QRLInternal<AttrExpressionFn>;
        const styleScopedId = parts[target.depsIndex + 4] as string | null;
        const fn = withCaptures(await qrl.resolve(), args);
        return {
          deps: target.deps,
          effect: new AttrExpressionEffect(element, name, args, fn, styleScopedId ?? undefined),
        };
      }
      const source = readRequiredDomSource(target.deps, target.targetKind);
      const styleScopedId = parts[target.depsIndex + 2] as string | null;
      return {
        deps: target.deps,
        effect: new AttrEffect(element, name, source, styleScopedId ?? undefined),
      };
    }
    case EffectKind.Props: {
      const target = readDomSubscriptionTarget(parts);
      const element = resolveElementTarget(container, target.targetKind, target.targetId);
      const qrl = parts[target.depsIndex + 2] as QRLInternal<
        (...args: unknown[]) => Record<string, unknown> | null | undefined
      >;
      const args = parts[target.depsIndex + 1] as unknown[];
      const styleScopedId = parts[target.depsIndex + 3] as string | null;
      const fn = withCaptures(await qrl.resolve(), args);
      return {
        deps: target.deps,
        effect: new PropsEffect(element, args, fn, styleScopedId ?? undefined),
      };
    }
    default:
      throw qError(QError.serializeErrorNotImplemented, [kind]);
  }
}

function readDomSubscriptionTarget(parts: unknown[]): {
  targetKind: EffectTargetKind;
  targetId: number;
  markerIndex: number | undefined;
  depsIndex: number;
  deps: Source[];
} {
  const targetKind = parts[1] as EffectTargetKind;
  const targetId = parts[2] as number;
  const isRangeText = targetKind === EffectTargetKind.RangeText;
  const markerIndex = isRangeText ? (parts[3] as number) : undefined;
  const depsIndex = isRangeText ? 4 : 3;
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
): Element {
  if (targetKind !== EffectTargetKind.Element) {
    throw new Error(`Unsupported element target kind ${targetKind}.`);
  }
  const element = findQwikElement(container.element, elementId);
  isDev && assertDefined(element, `Missing Qwik element ${elementId}.`);
  return element!;
}

function resolveTextTarget(
  container: ContainerContext,
  targetKind: EffectTargetKind,
  elementId: number,
  markerIndex: number | undefined
): Text {
  const element = findQwikElement(container.element, elementId);

  if (targetKind === EffectTargetKind.ElementText) {
    isDev && assertDefined(element, `Missing Qwik element ${elementId}.`);
    const text = findElementText(element!);
    isDev && assertDefined(text, `Missing text target ${elementId}.`);
    return text!;
  }
  if (targetKind === EffectTargetKind.RangeText) {
    isDev && assertNumber(markerIndex, `Missing range text marker index for element ${elementId}.`);
    const text =
      element == null
        ? resolveBranchTextTarget(container, elementId, markerIndex!)
        : findTextNode(element, markerIndex!);
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
  const range = findBranchRange(container.element, rangeId);
  if (range !== null) {
    return findBranchTextNode(range, markerIndex);
  }
  const rowRange = findForRowRange(container.element, rangeId);
  if (rowRange !== null) {
    return findBranchTextNode(rowRange, markerIndex);
  }
  const slotRange = findSlotRange(container.element, rangeId);
  return slotRange === null ? null : findBranchTextNode(slotRange, markerIndex);
}

function restoreDependencies(
  collector:
    | DomSubscriber
    | BranchSubscription
    | ForBlockSubscription
    | ContentSubscription
    | TaskSubscriber
    | ComputedSubscriber<unknown>
    | AsyncSignal<unknown>
    | SerializerSignal<unknown, unknown>,
  deps: Source[]
) {
  if (deps && deps.length > 0) {
    collector.deps = [];
    collector.depVersions = [];
    for (let i = 0; i < deps.length; i++) {
      addDependency(collector, deps[i]);
    }
  }
}

/**
 * Restores an array eagerly. If you need it lazily, use `deserializeData(container, TypeIds.Array,
 * array)` instead
 */
export const _eagerDeserializeArray = (
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
          output[index / 2] = value;
          return drain();
        });
      }
      output[index / 2] = value;
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
