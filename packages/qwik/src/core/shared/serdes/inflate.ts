import { isDev } from '@qwik.dev/core/build';
import { NEEDS_COMPUTATION } from '../../reactive-primitives/types';
import { Branch, BranchRange, BranchSubscription } from '../../vdomless/dom/branch/branch';
import {
  AttrEffect,
  SerializedAttrEffect,
  TextExpressionEffect,
  TextNodeEffect,
  type TextExpressionFn,
} from '../../vdomless/dom/effect/effect';
import { EffectKind } from '../../vdomless/dom/effect/effect-kind.enum';
import { EffectTargetKind } from '../../vdomless/dom/effect/ssr-effect';
import { ComputedFlags } from '../../vdomless/reactive/flags';
import { Signal as VdomlessSignal } from '../../vdomless/reactive/signal';
import type { Dependency } from '../../vdomless/reactive/source';
import { addDependency } from '../../vdomless/reactive/tracking';
import type { ContainerContext } from '../../vdomless/runtime/container-context';
import type { ContextScope } from '../../vdomless/runtime/context-scope';
import { createOwner, registerSubscriberToOwner } from '../../vdomless/runtime/owner';
import { NodeWalker } from '../../vdomless/runtime/node-walker';
import type {
  ComputedSubscriber,
  DomSubscriber,
  Subscriber,
} from '../../vdomless/runtime/subscriber';
import { assertDefined, assertNumber } from '../error/assert';
import { qError, QError } from '../error/error';
import type { QRLInternal } from '../qrl/qrl-class';
import { allocate, resolvers } from './allocate';
import { TypeIds } from './constants';
import { needsInflation } from './deser-proxy';

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

export const inflate = async (
  container: ContainerContext,
  target: unknown,
  typeId: TypeIds,
  data: unknown
): Promise<void> => {
  if (typeId === TypeIds.Plain) {
    // Already processed
    return;
  }
  // Restore the complex data, special case for Array
  if (typeId !== TypeIds.Array && Array.isArray(data)) {
    data = await _eagerDeserializeArray(container, data);
  }
  switch (typeId) {
    case TypeIds.Array:
      // Arrays are special, we need to fill the array in place
      await _eagerDeserializeArray(container, data as unknown[], target as unknown[]);
      break;
    case TypeIds.Object:
      if (data === 0) {
        // Special case, was an empty object
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
      const signal = target as VdomlessSignal<unknown>;
      const d = data as [unknown, ...DomSubscriber[]];
      signal.v = d[0];
      break;
    }
    case TypeIds.ComputedSignal: {
      const computed = target as Writeable<ComputedSubscriber<unknown>>;
      ensureDeserializedOwner(computed);
      const [qrl, deps, value] = data as [
        QRLInternal<() => unknown>,
        Dependency[],
        unknown,
        ...DomSubscriber[],
      ];
      computed.compute = await qrl.resolve();
      if (deps && deps.length > 0) {
        computed.deps = [];
        computed.depVersions = [];
        for (let i = 0; i < deps.length; i++) {
          addDependency(computed, deps[i]);
        }
      }

      if (value === NEEDS_COMPUTATION) {
        computed.flags = ComputedFlags.Dirty;
      } else {
        computed.v = value;
        computed.flags = ComputedFlags.HasValue;
      }
      break;
    }
    case TypeIds.Error: {
      const d = data as string[];
      (target as Error).message = d[0] as string;
      for (let i = 1; i < d.length; i += 2) {
        (target as any)[d[i]] = d[i + 1];
      }
      break;
    }
    case TypeIds.FormData: {
      const formData = target as FormData;
      const d = data as any[];
      for (let i = 0; i < d.length; i++) {
        formData.append(d[i++], d[i]);
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
    case TypeIds.Promise: {
      const promise = target as Promise<unknown>;
      const [resolved, result] = data as [boolean, unknown];
      const [resolve, reject] = resolvers.get(promise)!;
      if (resolved) {
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
          restoreBranchSubscription(container, target as Writeable<BranchSubscription>, parts);
          break;
        }
        case EffectKind.TextNode: {
          restoreTextNodeSubscription(container, target as Writeable<DomSubscriber>, parts);
          break;
        }
        case EffectKind.TextExpression: {
          await restoreTextExpressionSubscription(
            container,
            target as Writeable<DomSubscriber>,
            parts
          );
          break;
        }
        case EffectKind.Attr: {
          restoreAttrSubscription(container, target as Writeable<DomSubscriber>, parts);
          break;
        }
        case EffectKind.SerializedAttr: {
          restoreSerializedAttrSubscription(container, target as Writeable<DomSubscriber>, parts);
          break;
        }
        default:
          throw qError(QError.serializeErrorNotImplemented, [kind]);
      }
      break;
    }
    default:
      throw qError(QError.serializeErrorNotImplemented, [typeId]);
  }
};

function restoreBranchSubscription(
  container: ContainerContext,
  subscription: Writeable<BranchSubscription>,
  parts: unknown[]
): void {
  const rangeId = parts[1] as number;
  const mountedBranch = parts[2] == null ? undefined : (parts[2] as 0 | 1);
  const deps = parts[3] as Dependency[];
  const conditionQrl = parts[4] as QRLInternal<() => boolean>;
  const thenQrl = parts[5] as QRLInternal<(ctx: ContainerContext) => readonly Node[]>;
  const elseQrl =
    (parts[6] as QRLInternal<(ctx: ContainerContext) => readonly Node[]> | null) ?? undefined;
  const ownedSubscribers = parts[7] as Subscriber[] | undefined;
  const markerRange = NodeWalker.instance.findBranchRange(container.element, rangeId);
  isDev && assertDefined(markerRange, `Missing branch range ${rangeId}.`);
  if (markerRange === null) {
    throw new Error(`Missing branch range ${rangeId}.`);
  }

  subscription.branch = new Branch(
    new BranchRange(markerRange[0], markerRange[1]),
    conditionQrl,
    thenQrl,
    elseQrl,
    mountedBranch ?? null,
    null,
    container
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

function ensureDeserializedOwner(subscriber: Subscriber): void {
  if (subscriber.owner === null) {
    registerSubscriberToOwner(subscriber, createOwner(null));
  }
}

function restoreTextNodeSubscription(
  container: ContainerContext,
  subscription: Writeable<DomSubscriber>,
  parts: unknown[]
): void {
  const target = readDomSubscriptionTarget(parts);
  const text = resolveTextTarget(container, target.targetKind, target.targetId, target.markerIndex);

  subscription.effect = new TextNodeEffect(text, target.deps[0]);
  restoreDependencies(subscription, target.deps);
}

async function restoreTextExpressionSubscription(
  container: ContainerContext,
  subscription: Writeable<DomSubscriber>,
  parts: unknown[]
): Promise<void> {
  const target = readDomSubscriptionTarget(parts);
  const text = resolveTextTarget(container, target.targetKind, target.targetId, target.markerIndex);
  const qrl = parts[target.depsIndex + 2] as QRLInternal<TextExpressionFn>;
  const fn = await qrl.resolve();

  subscription.effect = new TextExpressionEffect(
    text,
    parts[target.depsIndex + 1] as unknown[],
    (...args) => {
      return fn(...args);
    }
  );
  restoreDependencies(subscription, target.deps);
}

function restoreAttrSubscription(
  container: ContainerContext,
  subscription: Writeable<DomSubscriber>,
  parts: unknown[]
): void {
  const target = readDomSubscriptionTarget(parts);
  const source = readRequiredDomSource(target.deps, target.targetKind);
  const element = resolveElementTarget(container, target.targetKind, target.targetId);

  subscription.effect = new AttrEffect(element, String(parts[4]), source);
  restoreDependencies(subscription, target.deps);
}

function restoreSerializedAttrSubscription(
  container: ContainerContext,
  subscription: Writeable<DomSubscriber>,
  parts: unknown[]
): void {
  const target = readDomSubscriptionTarget(parts);
  const source = readRequiredDomSource(target.deps, target.targetKind);
  const element = resolveElementTarget(container, target.targetKind, target.targetId);

  subscription.effect = new SerializedAttrEffect(element, source, parts[4] as any);
  restoreDependencies(subscription, target.deps);
}

function readDomSubscriptionTarget(parts: unknown[]): {
  targetKind: EffectTargetKind;
  targetId: number;
  markerIndex: number | undefined;
  depsIndex: number;
  deps: Dependency[];
} {
  const targetKind = parts[1] as EffectTargetKind;
  const targetId = parts[2] as number;
  const isRangeText = targetKind === EffectTargetKind.RangeText;
  const markerIndex = isRangeText ? (parts[3] as number) : undefined;
  const depsIndex = isRangeText ? 4 : 3;
  const deps = parts[depsIndex] as Dependency[];
  return { targetKind, targetId, markerIndex, depsIndex, deps };
}

function readRequiredDomSource(deps: Dependency[], targetKind: EffectTargetKind): Dependency {
  if (!Array.isArray(deps) || deps.length === 0) {
    throw new Error('DOM subscription requires a source dependency.');
  }
  if (targetKind !== EffectTargetKind.Element) {
    throw new Error(`Unsupported element target kind ${targetKind}.`);
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
  const element = NodeWalker.instance.findQwikElement(container.element, elementId);
  isDev && assertDefined(element, `Missing Qwik element ${elementId}.`);
  return element!;
}

function resolveTextTarget(
  container: ContainerContext,
  targetKind: EffectTargetKind,
  elementId: number,
  markerIndex: number | undefined
): Text {
  const element = NodeWalker.instance.findQwikElement(container.element, elementId);
  isDev && assertDefined(element, `Missing Qwik element ${elementId}.`);
  if (targetKind === EffectTargetKind.ElementText) {
    const text = NodeWalker.instance.findElementText(element!);
    isDev && assertDefined(text, `Missing text target ${elementId}.`);
    return text!;
  }
  if (targetKind === EffectTargetKind.RangeText) {
    isDev && assertNumber(markerIndex, `Missing range text marker index for element ${elementId}.`);
    const text = NodeWalker.instance.findTextNode(element!, markerIndex!);
    isDev && assertDefined(text, `Missing range text target ${elementId}:${markerIndex}.`);
    return text!;
  }
  throw new Error(`Unsupported text target kind ${targetKind}.`);
}

function restoreDependencies(collector: DomSubscriber | BranchSubscription, deps: Dependency[]) {
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
export const _eagerDeserializeArray = async (
  container: ContainerContext,
  data: unknown[],
  output: unknown[] = Array(data.length / 2)
): Promise<unknown[]> => {
  for (let i = 0; i < data.length; i += 2) {
    output[i / 2] = await deserializeData(container, data[i] as TypeIds, data[i + 1]);
  }
  return output;
};

export async function deserializeData(
  container: ContainerContext,
  typeId: number,
  value: unknown
): Promise<unknown> {
  if (typeId === TypeIds.Plain) {
    return value;
  }
  const propValue = await allocate(container, typeId, value);
  if (needsInflation(typeId)) {
    await inflate(container, propValue, typeId, value);
  }
  return propValue;
}
