import { isDomContainer } from '../client/dom-container';
import { pad, qwikDebugToString } from '../debug';
import type { OnRenderFn } from '../shared/component.public';
import { assertDefined } from '../shared/error/assert';
import type { Props } from '../shared/jsx/jsx-runtime';
import { isServerPlatform } from '../shared/platform/platform';
import { type QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import type { Container, HostElement, SerializationStrategy } from '../shared/types';
import { ChoreType } from '../shared/util-chore-type';
import { ELEMENT_PROPS, OnRenderProp } from '../shared/utils/markers';
import { SerializerSymbol } from '../shared/serdes/verify';
import { isObject } from '../shared/utils/types';
import type { ISsrNode, SSRContainer } from '../ssr/ssr-types';
import { TaskFlags, isTask } from '../use/use-task';
import { ComputedSignalImpl } from './impl/computed-signal-impl';
import { SignalImpl } from './impl/signal-impl';
import type { WrappedSignalImpl } from './impl/wrapped-signal-impl';
import type { Signal } from './signal.public';
import { SubscriptionData, type NodePropPayload } from './subscription-data';
import {
  SerializationSignalFlags,
  EffectProperty,
  EffectSubscriptionProp,
  SignalFlags,
  type CustomSerializable,
  type EffectSubscription,
  type StoreTarget,
} from './types';

const DEBUG = false;

// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('SIGNAL', ...args.map(qwikDebugToString));

export const throwIfQRLNotResolved = (qrl: QRL) => {
  const resolved = qrl.resolved;
  if (!resolved) {
    // When we are creating a signal using a use method, we need to ensure
    // that the computation can be lazy and therefore we need to unsure
    // that the QRL is resolved.
    // When we re-create the signal from serialization (we don't create the signal
    // using useMethod) it is OK to not resolve it until the graph is marked as dirty.
    throw qrl.resolve();
  }
};

/** @public */
export const isSignal = (value: any): value is Signal<unknown> => {
  return value instanceof SignalImpl;
};

export const ensureContainsSubscription = (
  array: Set<EffectSubscription>,
  effectSubscription: EffectSubscription
) => {
  !array.has(effectSubscription) && array.add(effectSubscription);
};

/** Ensure the item is in back refs set */
export const ensureContainsBackRef = (array: EffectSubscription, value: any) => {
  array[EffectSubscriptionProp.BACK_REF] ||= new Set();
  !array[EffectSubscriptionProp.BACK_REF].has(value) &&
    array[EffectSubscriptionProp.BACK_REF].add(value);
};

export const addQrlToSerializationCtx = (
  effectSubscriber: EffectSubscription,
  container: Container | null
) => {
  if (!!container && !isDomContainer(container)) {
    const effect = effectSubscriber[EffectSubscriptionProp.CONSUMER];
    const property = effectSubscriber[EffectSubscriptionProp.PROPERTY];
    let qrl: QRL | null = null;
    if (isTask(effect)) {
      qrl = effect.$qrl$;
    } else if (effect instanceof ComputedSignalImpl) {
      qrl = effect.$computeQrl$;
    } else if (property === EffectProperty.COMPONENT) {
      qrl = container.getHostProp<QRL>(effect as ISsrNode, OnRenderProp);
    }
    if (qrl) {
      (container as SSRContainer).serializationCtx.$eventQrls$.add(qrl);
    }
  }
};

export const scheduleEffects = (
  container: Container | null,
  signal: SignalImpl | StoreTarget,
  effects: Set<EffectSubscription> | null
) => {
  const isBrowser = !isServerPlatform();
  if (effects) {
    const scheduleEffect = (effectSubscription: EffectSubscription) => {
      const consumer = effectSubscription[EffectSubscriptionProp.CONSUMER];
      const property = effectSubscription[EffectSubscriptionProp.PROPERTY];
      assertDefined(container, 'Container must be defined.');
      if (isTask(consumer)) {
        consumer.$flags$ |= TaskFlags.DIRTY;
        DEBUG && log('schedule.consumer.task', pad('\n' + String(consumer), '  '));
        let choreType = ChoreType.TASK;
        if (consumer.$flags$ & TaskFlags.VISIBLE_TASK) {
          choreType = ChoreType.VISIBLE;
        }
        container.$scheduler$(choreType, consumer);
      } else if (consumer instanceof SignalImpl) {
        // we don't schedule ComputedSignal/DerivedSignal directly, instead we invalidate it and
        // and schedule the signals effects (recursively)
        if (consumer instanceof ComputedSignalImpl) {
          // Ensure that the computed signal's QRL is resolved.
          // If not resolved schedule it to be resolved.
          if (!consumer.$computeQrl$.resolved) {
            container.$scheduler$(ChoreType.QRL_RESOLVE, null, consumer.$computeQrl$);
          }
        }

        (consumer as ComputedSignalImpl<unknown> | WrappedSignalImpl<unknown>).invalidate();
      } else if (property === EffectProperty.COMPONENT) {
        const host: HostElement = consumer as any;
        const qrl = container.getHostProp<QRLInternal<OnRenderFn<unknown>>>(host, OnRenderProp);
        assertDefined(qrl, 'Component must have QRL');
        const props = container.getHostProp<Props>(host, ELEMENT_PROPS);
        container.$scheduler$(ChoreType.COMPONENT, host, qrl, props);
      } else if (property === EffectProperty.VNODE) {
        if (isBrowser) {
          const host: HostElement = consumer;
          container.$scheduler$(ChoreType.NODE_DIFF, host, host, signal as SignalImpl);
        }
      } else {
        const host: HostElement = consumer;
        const effectData = effectSubscription[EffectSubscriptionProp.DATA];
        if (effectData instanceof SubscriptionData) {
          const data = effectData.data;
          const payload: NodePropPayload = {
            ...data,
            $value$: signal as SignalImpl,
          };
          container.$scheduler$(ChoreType.NODE_PROP, host, property, payload);
        }
      }
    };
    for (const effect of effects) {
      scheduleEffect(effect);
    }
  }

  DEBUG && log('done scheduling');
};

/** @internal */
export const isSerializerObj = <T extends { [SerializerSymbol]: (obj: any) => any }, S>(
  obj: unknown
): obj is CustomSerializable<T, S> => {
  return isObject(obj) && typeof (obj as any)[SerializerSymbol] === 'function';
};

export const getComputedSignalFlags = (
  serializationStrategy: SerializationStrategy
): SerializationSignalFlags | SignalFlags => {
  let flags = SignalFlags.INVALID;
  switch (serializationStrategy) {
    // TODO: implement this in the future
    // case 'auto':
    //   flags |= ComputedSignalFlags.SERIALIZATION_STRATEGY_AUTO;
    //   break;
    case 'never':
      flags |= SerializationSignalFlags.SERIALIZATION_STRATEGY_NEVER;
      break;
    case 'always':
      flags |= SerializationSignalFlags.SERIALIZATION_STRATEGY_ALWAYS;
      break;
  }
  return flags;
};
