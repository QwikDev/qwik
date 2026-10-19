import { qTest } from '../shared/utils/qdev';
import { assertDefined } from '../shared/error/assert';
import { isServerPlatform } from '../shared/platform/platform';
import type { QRL } from '../shared/qrl/qrl.public';
import type { Container, SerializationStrategy } from '../shared/types';
import { isOutOfOrderSegmentContainer } from '../shared/utils/container';
import { OnRenderProp } from '../shared/utils/markers';
import { SerializerSymbol } from '../shared/serdes/verify';
import { isObject } from '../shared/utils/types';
import type { ISsrNode, SSRContainer } from '../ssr/ssr-types';
import { TaskFlags, isTask } from '../use/use-task';
import { ComputedSignalImpl } from './impl/computed-signal-impl';
import { SignalImpl } from './impl/signal-impl';
import { WrappedSignalImpl } from './impl/wrapped-signal-impl';
import type { ComputedSignal, Signal } from './signal.public';
import { SubscriptionData, type NodeProp } from './subscription-data';
import {
  AsyncSignalFlags,
  ComputedSignalFlags,
  EffectProperty,
  SerializationSignalFlags,
  type Consumer,
  type CustomSerializable,
  type EffectBackRef,
  type EffectSubscription,
  type StoreTarget,
} from './types';
import { _EFFECT_BACK_REF } from './backref';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import { setNodeDiffPayload, setNodePropData } from '../shared/cursor/chore-execution';
import type { VNode } from '../shared/vnode/vnode';
import { NODE_PROPS_DATA_KEY } from '../shared/cursor/cursor-props';
import { isBrowser, isDev } from '@qwik.dev/core/build';
import { Brand, hasBrand } from '../shared/utils/brand';

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
  return hasBrand(value, Brand.Signal);
};

export const ensureContainsSubscription = (
  array: Set<EffectSubscription>,
  effectSubscription: EffectSubscription
) => {
  array.add(effectSubscription);
};

/** Ensure the item is in back refs set */
export const ensureContainsBackRef = (array: EffectSubscription, value: any) => {
  (array.backRef ||= new Set()).add(value);
};

export const addQrlToSerializationCtx = (
  effectSubscriber: EffectSubscription,
  container: Container | null
) => {
  if ((container as SSRContainer | null)?.serializationCtx) {
    const effect = effectSubscriber.consumer;
    const property = effectSubscriber.property;
    let qrl: QRL | null = null;
    if (isTask(effect)) {
      qrl = effect.$qrl$;
    } else if (effect instanceof ComputedSignalImpl) {
      qrl = effect.$computeQrl$;
    } else if (property === EffectProperty.COMPONENT) {
      qrl = container!.getHostProp<QRL>(effect as VNode, OnRenderProp);
    }
    if (qrl) {
      (container as SSRContainer).serializationCtx.$eventQrls$.add(qrl);
    }
  }
};

export const getEffectSerializationContainer = (
  renderContainer: Container | undefined,
  ownerContainer: Container | null
): Container | null => {
  if (
    renderContainer &&
    (!ownerContainer ||
      renderContainer === ownerContainer ||
      isOutOfOrderSegmentContainer(renderContainer))
  ) {
    return renderContainer;
  }
  return ownerContainer;
};

export type DerivedSignal = ComputedSignalImpl<any, any> | WrappedSignalImpl<any>;
type EffectConsumer = Exclude<Consumer, SignalImpl>;

/**
 * Derived signals (computed, wrapped) are the only signals that subscribe to other signals, so a
 * signal consumer is always one of them.
 */
const isDerivedConsumer = (consumer: Consumer): consumer is DerivedSignal =>
  consumer instanceof SignalImpl;

const isDerivedSource = (source: EffectBackRef): source is DerivedSignal =>
  source instanceof ComputedSignalImpl || source instanceof WrappedSignalImpl;

/**
 * Notify the subscribers of a changed signal. First the whole derived closure is marked (direct
 * observers DIRTY, transitive ones CHECK) so no consumer can observe a half-marked graph, then the
 * task/vnode effects are dispatched, and finally the derived signals that have such effects are
 * pulled in topological order. Each derived signal recomputes at most once per change.
 */
export const scheduleEffects = (
  container: Container | null,
  signal: SignalImpl | StoreTarget,
  effects: Set<EffectSubscription> | undefined
) => {
  if (!effects) {
    return;
  }
  let toPull: DerivedSignal[] | undefined;
  let toDispatch: EffectSubscription[] | undefined;
  for (const effectSubscription of effects) {
    const consumer = effectSubscription.consumer;
    if (isDerivedConsumer(consumer)) {
      toPull = markDirty(consumer, toPull);
    } else {
      (toDispatch ||= []).push(effectSubscription);
    }
  }
  if (toDispatch) {
    isDev && assertDefined(container, 'Container must be defined.');
    const isRunningOnBrowser = qTest ? !isServerPlatform() : isBrowser;
    for (let i = 0; i < toDispatch.length; i++) {
      dispatchEffect(container!, signal, toDispatch[i], isRunningOnBrowser);
    }
  }
  if (toPull) {
    pullAll(toPull);
  }
};

const dispatchEffect = (
  container: Container,
  signal: SignalImpl | StoreTarget,
  effectSubscription: EffectSubscription,
  isRunningOnBrowser: boolean
) => {
  const consumer = effectSubscription.consumer as EffectConsumer;
  const property = effectSubscription.property;
  if (isTask(consumer)) {
    consumer.$flags$ |= TaskFlags.DIRTY;
    markVNodeDirty(container, consumer.$el$, ChoreBits.TASKS);
  } else if (property === EffectProperty.COMPONENT) {
    markVNodeDirty(container, consumer, ChoreBits.COMPONENT);
  } else if (property === EffectProperty.VNODE) {
    if (isRunningOnBrowser) {
      setNodeDiffPayload(consumer as VNode, signal as Signal);
      markVNodeDirty(container, consumer, ChoreBits.NODE_DIFF);
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
      if (isRunningOnBrowser) {
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
      markVNodeDirty(container, consumer, ChoreBits.NODE_PROPS);
    }
  }
};

/**
 * Mark a derived signal DIRTY because a direct source changed, and mark everything downstream
 * CHECK. Returns the list of signals that must be pulled now because tasks or vnodes depend on
 * them; the rest stay lazy until read. An async node's pull only resolves CHECK: a promotion
 * schedules its job in a microtask, so several writes in one tick still start one job.
 */
export const markDirty = (
  signal: DerivedSignal,
  toPull: DerivedSignal[] | undefined
): DerivedSignal[] | undefined => {
  if ((signal as ComputedSignalImpl<unknown>).$disposed$) {
    return toPull;
  }
  signal.$flags$ &= ~ComputedSignalFlags.CHECK;
  if (signal.$flags$ & AsyncSignalFlags.ASYNC_MODE) {
    // async signals compute in a microtask and push when they settle
    (signal as ComputedSignalImpl<unknown>).$setInvalid$(true);
  } else if (signal instanceof ComputedSignalImpl) {
    signal.$flags$ |= ComputedSignalFlags.INVALID;
  } else {
    signal.$flags$ |= ComputedSignalFlags.INVALID | ComputedSignalFlags.SOURCE_CHANGED;
  }
  // Observers already marked stop the walk, so re-marking an INVALID node is cheap
  return markObserversCheck(signal, toPull);
};

const markCheck = (
  signal: DerivedSignal,
  toPull: DerivedSignal[] | undefined
): DerivedSignal[] | undefined => {
  // CHECK only ever means "walked this round"; INVALID can be left over from resume or a cleared
  // subscription, so such a node still has to be pulled for its effects
  if (signal.$flags$ & ComputedSignalFlags.CHECK) {
    return toPull;
  }
  if (!(signal.$flags$ & ComputedSignalFlags.INVALID)) {
    signal.$flags$ |= ComputedSignalFlags.CHECK;
  } else if (!(signal instanceof ComputedSignalImpl)) {
    // a wrapped signal without a value must still notify once it recomputes
    signal.$flags$ |= ComputedSignalFlags.SOURCE_CHANGED;
  }
  return markObserversCheck(signal, toPull);
};

const markObserversCheck = (
  signal: DerivedSignal,
  toPull: DerivedSignal[] | undefined
): DerivedSignal[] | undefined => {
  let hasEffectSubscribers =
    signal instanceof ComputedSignalImpl &&
    !!(signal.$loadingEffects$?.size || signal.$errorEffects$?.size);
  const effects = signal.$effects$;
  if (effects) {
    for (const effectSubscription of effects) {
      const consumer = effectSubscription.consumer;
      if (isDerivedConsumer(consumer)) {
        toPull = markCheck(consumer, toPull);
      } else {
        hasEffectSubscribers = true;
      }
    }
  }
  if (hasEffectSubscribers) {
    (toPull ||= []).push(signal);
  }
  return toPull;
};

/** Public `invalidate()`: mark, recompute this signal now (sync only), then pull its dependents. */
export const invalidateDerived = (signal: DerivedSignal) => {
  const toPull = markDirty(signal, undefined);
  if (!(signal.$flags$ & AsyncSignalFlags.ASYNC_MODE)) {
    signal.$pull$();
  }
  if (toPull) {
    pullAll(toPull);
  }
};

export const pullAll = (toPull: DerivedSignal[]) => {
  for (let i = 0; i < toPull.length; i++) {
    toPull[i].$pull$();
  }
};

/**
 * Resolve the CHECK state: pull the derived sources and recompute only if one of them changed (it
 * promotes this signal to INVALID through its own effects). Async sources are skipped: they push
 * when they settle.
 */
export const pullSourcesIfCheck = (signal: DerivedSignal) => {
  if (!(signal.$flags$ & ComputedSignalFlags.CHECK)) {
    return;
  }
  const sources = signal[_EFFECT_BACK_REF]?.get(EffectProperty.VNODE)?.backRef;
  if (!sources) {
    // A resumed signal has no source list, so the only safe answer is to recompute
    signal.$flags$ |= ComputedSignalFlags.INVALID;
  } else {
    const sourcesSnapshot = Array.from(sources);
    for (let i = 0; i < sourcesSnapshot.length; i++) {
      const source = sourcesSnapshot[i];
      if (isDerivedSource(source) && !(source.$flags$ & AsyncSignalFlags.ASYNC_MODE)) {
        source.$computeIfNeeded$();
      }
      if (signal.$flags$ & ComputedSignalFlags.INVALID) {
        break;
      }
    }
  }
  signal.$flags$ &= ~ComputedSignalFlags.CHECK;
};

/** @internal */
export const isSerializerObj = <T extends { [SerializerSymbol]: (obj: any) => any }, S>(
  obj: unknown
): obj is CustomSerializable<T, S> => {
  return isObject(obj) && typeof (obj as any)[SerializerSymbol] === 'function';
};

export const getComputedSignalFlags = (
  serializationStrategy: SerializationStrategy
): SerializationSignalFlags | ComputedSignalFlags => {
  let flags = ComputedSignalFlags.INVALID;
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

/**
 * Mark this signal as owned outside of the component that read it.
 *
 * Externally owned signals are preserved when found in a component's sequential scope during
 * component cleanup.
 *
 * @internal
 */
export const _markSignalAsExternallyOwned = (signal: ComputedSignal<unknown>) => {
  (signal as ComputedSignalImpl<unknown> | WrappedSignalImpl<unknown>).$flags$ |=
    ComputedSignalFlags.PRESERVE_ON_SEQ_CLEANUP;
};
