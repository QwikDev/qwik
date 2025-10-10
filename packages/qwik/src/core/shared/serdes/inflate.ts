import type { DomContainer } from '../../client/dom-container';
import { _EFFECT_BACK_REF } from '../../internal';
import type { AsyncComputedSignalImpl } from '../../reactive-primitives/impl/async-computed-signal-impl';
import type { ComputedSignalImpl } from '../../reactive-primitives/impl/computed-signal-impl';
import type { SignalImpl } from '../../reactive-primitives/impl/signal-impl';
import { getStoreHandler } from '../../reactive-primitives/impl/store';
import type { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import type { SubscriptionData } from '../../reactive-primitives/subscription-data';
import {
  NEEDS_COMPUTATION,
  SignalFlags,
  type AllSignalFlags,
  type AsyncComputeQRL,
  type EffectProperty,
  type EffectSubscription,
  type StoreFlags,
} from '../../reactive-primitives/types';
import type { ResourceReturnInternal } from '../../use/use-resource';
import type { Task } from '../../use/use-task';
import { SERIALIZABLE_STATE } from '../component.public';
import { qError, QError } from '../error/error';
import type { JSXNodeImpl } from '../jsx/jsx-runtime';
import type { QRLInternal } from '../qrl/qrl-class';
import type { DeserializeContainer, HostElement } from '../types';
import { ChoreType } from '../util-chore-type';
import { _CONST_PROPS, _VAR_PROPS } from '../utils/constants';
import { allocate, pendingStoreTargets } from './allocate';
import { needsInflation } from './deser-proxy';
import { resolvers } from './allocate';
import { TypeIds } from './constants';

export const inflate = (
  container: DeserializeContainer,
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
      for (let i = 0; i < (data as any[]).length; i += 2) {
        const key = (data as string[])[i];
        const value = (data as unknown[])[i + 1];
        (target as Record<string, unknown>)[key] = value;
      }
      break;
    case TypeIds.QRL:
    case TypeIds.PreloadQRL:
      _inflateQRL(container, target as QRLInternal<any>);
      break;
    case TypeIds.Task:
      const task = target as Task;
      const v = data as any[];
      task.$qrl$ = _inflateQRL(container, v[0]);
      task.$flags$ = v[1];
      task.$index$ = v[2];
      task.$el$ = v[3] as HostElement;
      task[_EFFECT_BACK_REF] = v[4] as Map<EffectProperty | string, EffectSubscription> | null;
      task.$state$ = v[5];
      break;
    case TypeIds.Resource:
      const [resolved, result, effects] = data as [boolean, unknown, any];
      const resource = target as ResourceReturnInternal<unknown>;
      if (resolved) {
        resource.value = Promise.resolve(result);
        resource._resolved = result;
        resource._state = 'resolved';
      } else {
        resource.value = Promise.reject(result);
        resource._error = result as Error;
        resource._state = 'rejected';
      }
      getStoreHandler(target as object)!.$effects$ = effects;
      break;
    case TypeIds.Component:
      (target as any)[SERIALIZABLE_STATE][0] = (data as any[])[0];
      break;
    case TypeIds.Store: {
      // Inflate the store target
      const store = target as object;
      const storeTarget = pendingStoreTargets.get(store);
      if (storeTarget) {
        pendingStoreTargets.delete(store);
        inflate(container, store, storeTarget.t, storeTarget.v);
      }
      /**
       * Note that we don't do anything with the innerstores we added during serialization, because
       * they are already inflated in the deserialize of the data, above.
       */
      const [, flags, effects] = data as unknown[];
      const storeHandler = getStoreHandler(store)!;
      storeHandler.$flags$ = flags as StoreFlags;
      storeHandler.$effects$ = effects as any;
      break;
    }
    case TypeIds.Signal: {
      const signal = target as SignalImpl<unknown>;
      const d = data as [unknown, ...EffectSubscription[]];
      signal.$untrackedValue$ = d[0];
      signal.$effects$ = new Set(d.slice(1) as EffectSubscription[]);
      break;
    }
    case TypeIds.WrappedSignal: {
      const signal = target as WrappedSignalImpl<unknown>;
      const d = data as [
        number,
        unknown[],
        Map<EffectProperty | string, EffectSubscription> | null,
        AllSignalFlags,
        HostElement,
        ...EffectSubscription[],
      ];
      signal.$func$ = container.getSyncFn(d[0]);
      signal.$args$ = d[1];
      signal[_EFFECT_BACK_REF] = d[2];
      signal.$untrackedValue$ = NEEDS_COMPUTATION;
      signal.$flags$ = d[3];
      signal.$flags$ |= SignalFlags.INVALID;
      signal.$hostElement$ = d[4];
      signal.$effects$ = new Set(d.slice(5) as EffectSubscription[]);
      break;
    }
    case TypeIds.AsyncComputedSignal: {
      const asyncComputed = target as AsyncComputedSignalImpl<unknown>;
      const d = data as [
        AsyncComputeQRL<unknown>,
        Array<EffectSubscription> | null,
        Array<EffectSubscription> | null,
        Array<EffectSubscription> | null,
        boolean,
        Error,
        unknown?,
      ];
      asyncComputed.$computeQrl$ = d[0];
      asyncComputed.$effects$ = new Set(d[1]);
      asyncComputed.$loadingEffects$ = new Set(d[2]);
      asyncComputed.$errorEffects$ = new Set(d[3]);
      asyncComputed.$untrackedLoading$ = d[4];
      asyncComputed.$untrackedError$ = d[5];
      const hasValue = d.length > 6;
      if (hasValue) {
        asyncComputed.$untrackedValue$ = d[6];
      }
      asyncComputed.$flags$ |= SignalFlags.INVALID;

      break;
    }
    // Inflating a SerializerSignal is the same as inflating a ComputedSignal
    case TypeIds.SerializerSignal:
    case TypeIds.ComputedSignal: {
      const computed = target as ComputedSignalImpl<unknown>;
      const d = data as [QRLInternal<() => {}>, EffectSubscription[] | null, unknown?];
      computed.$computeQrl$ = d[0];
      computed.$effects$ = new Set(d[1]);
      const hasValue = d.length > 2;
      if (hasValue) {
        computed.$untrackedValue$ = d[2];
        // The serialized signal is always invalid so it can recreate the custom object
        if (typeId === TypeIds.SerializerSignal) {
          computed.$flags$ |= SignalFlags.INVALID;
        }
      } else {
        computed.$flags$ |= SignalFlags.INVALID;
        /**
         * If we try to compute value and the qrl is not resolved, then system throws an error with
         * qrl promise. To prevent that we should early resolve computed qrl while computed
         * deserialization. This also prevents anything from firing while computed qrls load,
         * because of scheduler
         */
        // try to download qrl in this tick
        computed.$computeQrl$.resolve();
        (container as DomContainer).$scheduler$(ChoreType.QRL_RESOLVE, null, computed.$computeQrl$);
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
    case TypeIds.JSXNode: {
      const jsx = target as JSXNodeImpl<unknown>;
      const [type, varProps, constProps, children, flags, key] = data as any[];
      jsx.type = type;
      jsx.varProps = varProps;
      jsx.constProps = constProps;
      jsx.children = children;
      jsx.flags = flags;
      jsx.key = key;
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
      for (const s of buf) {
        bytes[i++] = s.charCodeAt(0);
      }
      break;
    case TypeIds.PropsProxy:
      const propsProxy = target as any;
      propsProxy[_VAR_PROPS] = data === 0 ? {} : (data as any)[0];
      propsProxy[_CONST_PROPS] = (data as any)[1];
      break;
    case TypeIds.SubscriptionData: {
      const effectData = target as SubscriptionData;
      effectData.data.$scopedStyleIdPrefix$ = (data as any[])[0];
      effectData.data.$isConst$ = (data as any[])[1];
      break;
    }
    default:
      throw qError(QError.serializeErrorNotImplemented, [typeId]);
  }
}; /**
 * Restores an array eagerly. If you need it lazily, use `deserializeData(container, TypeIds.Array,
 * array)` instead
 */

export const _eagerDeserializeArray = (
  container: DeserializeContainer,
  data: unknown[],
  output: unknown[] = Array(data.length / 2)
): unknown[] => {
  for (let i = 0; i < data.length; i += 2) {
    output[i / 2] = deserializeData(container, data[i] as TypeIds, data[i + 1]);
  }
  return output;
};
export function _inflateQRL(container: DeserializeContainer, qrl: QRLInternal<any>) {
  const captureIds = qrl.$capture$;
  qrl.$captureRef$ = captureIds ? captureIds.map((id) => container.$getObjectById$(id)) : null;
  if (container.element) {
    qrl.$setContainer$(container.element);
  }
  return qrl;
}
export function deserializeData(container: DeserializeContainer, typeId: number, value: unknown) {
  if (typeId === TypeIds.Plain) {
    return value;
  }
  const propValue = allocate(container, typeId, value);
  if (needsInflation(typeId)) {
    inflate(container, propValue, typeId, value);
  }
  return propValue;
}
