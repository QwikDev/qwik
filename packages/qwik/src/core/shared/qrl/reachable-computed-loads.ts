import { isServer } from '@qwik.dev/core/build';
import type { ComputedSignalImpl } from '../../reactive-primitives/impl/computed-signal-impl';
import type { SignalImpl } from '../../reactive-primitives/impl/signal-impl';
import type { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import { STORE_TARGET } from '../../reactive-primitives/types';
import { isServerPlatform } from '../platform/platform';
import { loadingHolder } from '../serdes/inflate';
import { fastSkipSerialize } from '../serdes/verify';
import { Brand, hasBrand } from '../utils/brand';
import { _CONST_PROPS, _VAR_PROPS } from '../utils/constants';
import { qTest } from '../utils/qdev';
import { isSerializableObject } from '../utils/types';

const SKIPPED_BRANDS =
  Brand.Task |
  Brand.JSXNode |
  Brand.SubscriptionData |
  Brand.VNode |
  Brand.DomContainer |
  Brand.StoreHandler |
  Brand.EffectSubscription |
  Brand.SubscriptionPatch |
  Brand.SerializationBackRef;

type PropsLike = { [_VAR_PROPS]: object | null; [_CONST_PROPS]: object | null };

const pushAll = (pending: unknown[], values: readonly unknown[]) => {
  for (let i = 0; i < values.length; i++) {
    pending.push(values[i]);
  }
};

const pushOwnDataValues = (pending: unknown[], obj: object) => {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, keys[i]);
    if (descriptor && 'value' in descriptor) {
      pending.push(descriptor.value);
    }
  }
};

const isOpaqueObject = (value: object) =>
  fastSkipSerialize(value) || hasBrand(value, SKIPPED_BRANDS);

const collectFromSignal = (
  signal: SignalImpl<unknown>,
  pending: unknown[],
  loads: Promise<unknown>[]
) => {
  if (hasBrand(signal, Brand.ComputedSignal) && !hasBrand(signal, Brand.AsyncSignal)) {
    const load = loadingHolder.computedLoads.get(signal);
    if (load) {
      loads.push(load);
    }
    const computeCaptures = (signal as ComputedSignalImpl<unknown>).$computeQrl$?.$captures$;
    if (Array.isArray(computeCaptures)) {
      pushAll(pending, computeCaptures);
    }
  } else if (hasBrand(signal, Brand.WrappedSignal)) {
    pushAll(pending, (signal as WrappedSignalImpl<unknown>).$args$);
  }
  pending.push(signal.$untrackedValue$);
};

const collectFromObject = (value: object, pending: unknown[], loads: Promise<unknown>[]) => {
  if (isOpaqueObject(value)) {
    return;
  }
  if (hasBrand(value, Brand.Signal)) {
    collectFromSignal(value as SignalImpl<unknown>, pending, loads);
    return;
  }
  const storeTarget = (value as { [STORE_TARGET]?: object })[STORE_TARGET];
  if (storeTarget) {
    pending.push(storeTarget);
    return;
  }
  if (_VAR_PROPS in value) {
    pending.push((value as PropsLike)[_VAR_PROPS], (value as PropsLike)[_CONST_PROPS]);
    return;
  }
  if (Array.isArray(value)) {
    pushAll(pending, value);
    return;
  }
  if (value instanceof Map || value instanceof Set) {
    for (const item of value.values()) {
      pending.push(item);
    }
    return;
  }
  if (isSerializableObject(value)) {
    pushOwnDataValues(pending, value);
  }
};

export const waitForReachableComputedLoads = (
  values: readonly unknown[] | null | undefined,
  moreValues?: readonly unknown[]
): Promise<unknown> | undefined => {
  if (!loadingHolder.inFlight || (qTest ? isServerPlatform() : isServer)) {
    return;
  }
  const pending: unknown[] = [];
  if (values) {
    pushAll(pending, values);
  }
  if (moreValues) {
    pushAll(pending, moreValues);
  }
  const visited = new Set<object>();
  const loads: Promise<unknown>[] = [];
  while (pending.length) {
    const value = pending.pop();
    if (value === null || typeof value !== 'object' || visited.has(value)) {
      continue;
    }
    visited.add(value);
    collectFromObject(value, pending, loads);
  }
  return loads.length > 1 ? Promise.all(loads) : loads[0];
};
