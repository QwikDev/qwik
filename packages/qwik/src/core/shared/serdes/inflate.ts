import { NEEDS_COMPUTATION } from '../../reactive-primitives/types';
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
import { ReactiveFlags as VdomlessReactiveFlags } from '../../vdomless/reactive/flags';
import { Signal as VdomlessSignal } from '../../vdomless/reactive/signal';
import type { Dependency } from '../../vdomless/reactive/source';
import { addDependency } from '../../vdomless/reactive/tracking';
import type { ContainerContext } from '../../vdomless/runtime/container-context';
import type { DomSubscriber } from '../../vdomless/runtime/subscriber';
import { qError, QError } from '../error/error';
import type { QRLInternal } from '../qrl/qrl-class';
import { ELEMENT_ID } from '../utils/markers';
import { allocate, resolvers } from './allocate';
import { TypeIds } from './constants';
import { needsInflation } from './deser-proxy';

export let loading = Promise.resolve();

const dangerousObjectKeys = new Set([
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'toJSON',
  'then',
]);
const COMMENT_NODE = 8;
const TEXT_NODE = 3;
const RANGE_TEXT_MARKER = 't';
const ELEMENT_ID_SELECTOR = ELEMENT_ID.replace(':', '\\:');

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
): void => {
  if (typeId === TypeIds.Plain) {
    // Already processed
    return;
  }
  // Restore the complex data, special case for Array
  if (typeId !== TypeIds.Array && Array.isArray(data)) {
    data = _eagerDeserializeArray(container, data);
  }
  switch (typeId) {
    case TypeIds.Array:
      // Arrays are special, we need to fill the array in place
      _eagerDeserializeArray(container, data as unknown[], target as unknown[]);
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
      const computed = target as ComputedQrl<unknown>;
      const [qrl, deps, value] = data as [
        QRLInternal<() => unknown>,
        Dependency[],
        unknown,
        ...DomSubscriber[],
      ];
      (computed as { computeQrl: QRLInternal<() => unknown> }).computeQrl = qrl;
      if (qrl.resolved === undefined) {
        const p = qrl.resolve().catch(() => {
          // ignore preload errors; the eventual caller will report the real load failure
        });
        loading = loading.finally(() => p);
      }
      if (deps && deps.length > 0) {
        computed.deps = [];
        computed.depVersions = [];
        for (let i = 0; i < deps.length; i++) {
          addDependency(computed, deps[i]);
        }
      }

      if (value === NEEDS_COMPUTATION) {
        computed.flags = VdomlessReactiveFlags.Dirty;
      } else {
        computed.v = value;
        computed.flags = VdomlessReactiveFlags.HasValue;
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
      const subscription = target as DomSubscriber;
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
          if (!Array.isArray(deps) || deps.length === 0) {
            throw new Error('DOM subscription requires a source dependency.');
          }

          const text = resolveTextTarget(container, targetKind, targetId, markerIndex);

          (subscription as { effect: DomSubscriber['effect'] }).effect = new TextNodeEffect(
            text,
            deps[0]
          );
          break;
        }
        case EffectKind.TextExpression: {
          const text = resolveTextTarget(container, targetKind, targetId, markerIndex);

          const qrl = parts[depsIndex + 2] as QRLInternal<TextExpressionFn>;
          if (qrl.resolved === undefined) {
            const p = qrl.resolve().catch(() => {
              // ignore preload errors; the eventual caller will report the real load failure
            });
            loading = loading.finally(() => p);
          }

          (subscription as { effect: DomSubscriber['effect'] }).effect = new TextExpressionEffect(
            text,
            parts[depsIndex + 1] as unknown[],
            (...args) => {
              const fn = qrl.resolved;
              if (fn === undefined) {
                throw new Error('Text expression QRL was not resolved before DOM update.');
              }
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
          const targetElement = resolveElementTarget(container, targetId);
          (subscription as { effect: DomSubscriber['effect'] }).effect = new AttrEffect(
            targetElement,
            String(parts[4]),
            deps[0]
          );
          break;
        }
        case EffectKind.SerializedAttr: {
          if (!Array.isArray(deps) || deps.length === 0) {
            throw new Error('DOM subscription requires a source dependency.');
          }
          if (targetKind !== EffectTargetKind.Element) {
            throw new Error(`Unsupported element target kind ${targetKind}.`);
          }
          const targetElement = resolveElementTarget(container, targetId);
          (subscription as { effect: DomSubscriber['effect'] }).effect = new SerializedAttrEffect(
            targetElement,
            deps[0],
            parts[4] as any
          );
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
  const element = resolveElementTarget(container, elementId);
  if (targetKind === EffectTargetKind.ElementText) {
    const node = element.firstChild;
    if (node === null || node.nodeType !== TEXT_NODE) {
      throw new Error(`Missing text target ${elementId}.`);
    }
    return node as Text;
  }
  if (targetKind === EffectTargetKind.RangeText) {
    if (typeof markerIndex !== 'number') {
      throw new Error(`Missing range text marker index for element ${elementId}.`);
    }
    return resolveRangeTextTarget(element, elementId, markerIndex);
  }
  throw new Error(`Unsupported text target kind ${targetKind}.`);
}

function resolveElementTarget(container: ContainerContext, elementId: number): Element {
  const element = container.element;
  if (element === null) {
    throw new Error('Missing Qwik container element.');
  }
  const stringId = String(elementId);
  if (element.getAttribute(ELEMENT_ID) === stringId) {
    return element;
  }
  const targetElement = element.querySelector(`[${ELEMENT_ID_SELECTOR}="${stringId}"]`);
  if (targetElement === null) {
    throw new Error(`Missing Qwik element ${elementId}.`);
  }
  return targetElement;
}

function resolveRangeTextTarget(element: Element, elementId: number, markerIndex: number): Text {
  let index = 0;
  let child = element.firstChild;
  while (child !== null) {
    if (child.nodeType === COMMENT_NODE && (child as Comment).data === RANGE_TEXT_MARKER) {
      if (index === markerIndex) {
        const text = child.nextSibling;
        if (text === null || text.nodeType !== TEXT_NODE) {
          throw new Error(`Missing range text target ${elementId}:${markerIndex}.`);
        }
        return text as Text;
      }
      index++;
    }
    child = child.nextSibling;
  }
  throw new Error(`Missing range text marker ${elementId}:${markerIndex}.`);
}

/**
 * Restores an array eagerly. If you need it lazily, use `deserializeData(container, TypeIds.Array,
 * array)` instead
 */
export const _eagerDeserializeArray = (
  container: ContainerContext,
  data: unknown[],
  output: unknown[] = Array(data.length / 2)
): unknown[] => {
  for (let i = 0; i < data.length; i += 2) {
    output[i / 2] = deserializeData(container, data[i] as TypeIds, data[i + 1]);
  }
  return output;
};

export function deserializeData(container: ContainerContext, typeId: number, value: unknown) {
  if (typeId === TypeIds.Plain) {
    return value;
  }
  const propValue = allocate(container, typeId, value);
  if (needsInflation(typeId)) {
    inflate(container, propValue, typeId, value);
  }
  return propValue;
}
