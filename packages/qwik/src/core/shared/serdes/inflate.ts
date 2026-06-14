import { isDev } from '@qwik.dev/core/build';
import { NEEDS_COMPUTATION } from '../../reactive-primitives/types';
import type { Computed } from '../../vdomless';
import {
  AttrEffect,
  SerializedAttrEffect,
  TextExpressionEffect,
  TextNodeEffect,
  type TextExpressionFn,
} from '../../vdomless/dom/effect/effect';
import { EffectKind } from '../../vdomless/dom/effect/effect-kind.enum';
import { EffectTargetKind } from '../../vdomless/dom/effect/ssr-effect';
import { ComputedQrl } from '../../vdomless/reactive/computed-qrl';
import { ReactiveFlags } from '../../vdomless/reactive/flags';
import { Signal as VdomlessSignal } from '../../vdomless/reactive/signal';
import type { Dependency } from '../../vdomless/reactive/source';
import { addDependency } from '../../vdomless/reactive/tracking';
import type { ContainerContext } from '../../vdomless/runtime/container-context';
import type { ContextScope } from '../../vdomless/runtime/context-scope';
import { NodeWalker } from '../../vdomless/runtime/node-walker';
import type { DomSubscriber } from '../../vdomless/runtime/subscriber';
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
      const computed = target as Writeable<Computed<unknown>>;
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
        computed.flags = ReactiveFlags.Dirty;
      } else {
        computed.v = value;
        computed.flags = ReactiveFlags.HasValue;
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
      const subscription = target as Writeable<DomSubscriber>;
      const parts = data as unknown[];
      const kind = parts[0] as EffectKind;
      const targetKind = parts[1] as EffectTargetKind;
      const targetId = parts[2] as number;
      const isRangeText = targetKind === EffectTargetKind.RangeText;
      const markerIndex = isRangeText ? (parts[3] as number) : undefined;
      const depsIndex = isRangeText ? 4 : 3;
      const deps = parts[depsIndex] as Dependency[];

      switch (kind) {
        case EffectKind.TextNode: {
          const text = resolveTextTarget(container, targetKind, targetId, markerIndex);

          subscription.effect = new TextNodeEffect(text, deps[0]);
          break;
        }
        case EffectKind.TextExpression: {
          const text = resolveTextTarget(container, targetKind, targetId, markerIndex);

          const qrl = parts[depsIndex + 2] as QRLInternal<TextExpressionFn>;
          const fn = await qrl.resolve();
          subscription.effect = new TextExpressionEffect(
            text,
            parts[depsIndex + 1] as unknown[],
            (...args) => {
              return fn(...args);
            }
          );
          break;
        }
        case EffectKind.Attr: {
          if (!Array.isArray(deps) || deps.length === 0) {
            throw new Error('DOM subscription requires a source dependency.');
          }
          if (targetKind !== EffectTargetKind.Element) {
            throw new Error(`Unsupported element target kind ${targetKind}.`);
          }
          const targetElement = NodeWalker.instance.findQwikElement(container.element, targetId);
          isDev && assertDefined(targetElement, `Missing Qwik element ${targetId}.`);
          subscription.effect = new AttrEffect(targetElement, String(parts[4]), deps[0]);
          break;
        }
        case EffectKind.SerializedAttr: {
          if (!Array.isArray(deps) || deps.length === 0) {
            throw new Error('DOM subscription requires a source dependency.');
          }
          if (targetKind !== EffectTargetKind.Element) {
            throw new Error(`Unsupported element target kind ${targetKind}.`);
          }
          const targetElement = NodeWalker.instance.findQwikElement(container.element, targetId);
          isDev && assertDefined(targetElement, `Missing Qwik element ${targetId}.`);
          subscription.effect = new SerializedAttrEffect(targetElement, deps[0], parts[4] as any);
          break;
        }
        default:
          throw qError(QError.serializeErrorNotImplemented, [kind]);
      }

      if (deps && deps.length > 0) {
        subscription.deps = [];
        subscription.depVersions = [];
        for (let i = 0; i < deps.length; i++) {
          addDependency(subscription, deps[i]);
        }
      }
      break;
    }
    default:
      throw qError(QError.serializeErrorNotImplemented, [typeId]);
  }
};

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
