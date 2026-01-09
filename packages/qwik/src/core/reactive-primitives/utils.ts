import { qwikDebugToString } from '../debug';
import { assertDefined } from '../shared/error/assert';
import { isServerPlatform } from '../shared/platform/platform';
import type { QRL } from '../shared/qrl/qrl.public';
import type { Container, SerializationStrategy } from '../shared/types';
import { OnRenderProp } from '../shared/utils/markers';
import { SerializerSymbol } from '../shared/serdes/verify';
import { isObject } from '../shared/utils/types';
import type { ISsrNode, SSRContainer } from '../ssr/ssr-types';
import { TaskFlags, isTask, type Task } from '../use/use-task';
import { ComputedSignalImpl } from './impl/computed-signal-impl';
import { SignalImpl } from './impl/signal-impl';
import type { WrappedSignalImpl } from './impl/wrapped-signal-impl';
import type { Signal } from './signal.public';
import { SubscriptionData, type NodeProp } from './subscription-data';
import {
  SerializationSignalFlags,
  EffectProperty,
  SignalFlags,
  type CustomSerializable,
  type EffectSubscription,
  type StoreTarget,
} from './types';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import { setNodeDiffPayload, setNodePropData } from '../shared/cursor/chore-execution';
import type { VNode } from '../shared/vnode/vnode';
import { NODE_PROPS_DATA_KEY } from '../shared/cursor/cursor-props';
import { isDev, isServer } from '@qwik.dev/core/build';

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
  array.add(effectSubscription);
};

/** Ensure the item is in back refs set */
export const ensureContainsBackRef = (array: EffectSubscription, value: any) => {
  array.backRef ||= new Set();
  array.backRef.add(value);
};

export const addQrlToSerializationCtx = (
  effectSubscriber: EffectSubscription,
  container: Container | null
) => {
  if (container) {
    const effect = effectSubscriber.consumer;
    const property = effectSubscriber.property;
    let qrl: QRL | null = null;
    if (isTask(effect)) {
      qrl = effect.$qrl$;
    } else if (effect instanceof ComputedSignalImpl) {
      qrl = effect.$computeQrl$;
    } else if (property === EffectProperty.COMPONENT) {
      qrl = container.getHostProp<QRL>(effect as VNode, OnRenderProp);
    }
    if (qrl) {
      (container as SSRContainer).serializationCtx.$eventQrls$.add(qrl);
    }
  }
};

export const scheduleEffects = (
  container: Container | null,
  signal: SignalImpl | StoreTarget,
  effects: Set<EffectSubscription> | undefined
) => {
  const isBrowser = import.meta.env.TEST ? !isServerPlatform() : !isServer;
  if (effects) {
    let tasksToTrigger: Task[] | null = null;
    const scheduleEffect = (effectSubscription: EffectSubscription) => {
      const consumer = effectSubscription.consumer;
      const property = effectSubscription.property;
      isDev && assertDefined(container, 'Container must be defined.');
      if (isTask(consumer)) {
        consumer.$flags$ |= TaskFlags.DIRTY;
        if (isBrowser) {
          markVNodeDirty(container!, consumer.$el$, ChoreBits.TASKS);
        } else {
          // for server we run tasks sync, so they can change currently running effects
          // in this case we could have infinite loop if we trigger tasks here
          // so instead we collect them and trigger them after the effects are scheduled
          (tasksToTrigger ||= []).push(consumer);
        }
      } else if (consumer instanceof SignalImpl) {
        (consumer as ComputedSignalImpl<unknown> | WrappedSignalImpl<unknown>).invalidate();
      } else if (property === EffectProperty.COMPONENT) {
        markVNodeDirty(container!, consumer, ChoreBits.COMPONENT);
      } else if (property === EffectProperty.VNODE) {
        if (isBrowser) {
          setNodeDiffPayload(consumer as VNode, signal as Signal);
          markVNodeDirty(container!, consumer, ChoreBits.NODE_DIFF);
        }
      } else {
        const effectData = effectSubscription.data;
        if (effectData instanceof SubscriptionData) {
          const data = effectData.data;
          const payload: NodeProp = {
            isConst: data.$isConst$,
            scopedStyleIdPrefix: data.$scopedStyleIdPrefix$,
            value: signal as SignalImpl,
          };
          if (isBrowser) {
            setNodePropData(consumer as VNode, property, payload);
          } else {
            const node = consumer as ISsrNode;
            let data = node.getProp(NODE_PROPS_DATA_KEY) as Map<string, NodeProp> | null;
            if (!data) {
              data = new Map();
              node.setProp(NODE_PROPS_DATA_KEY, data);
            }
            data.set(property, payload);
          }
          markVNodeDirty(container!, consumer, ChoreBits.NODE_PROPS);
        }
      }
    };
    for (const effect of effects) {
      scheduleEffect(effect);
    }

    if (!isBrowser && container && tasksToTrigger) {
      for (const task of tasksToTrigger as Task[]) {
        markVNodeDirty(container, task.$el$, ChoreBits.TASKS);
      }
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
