import { vnode_getProp, vnode_isTextVNode, vnode_isVNode, vnode_setProp } from '../client/vnode';
import { pad, qwikDebugToString } from '../debug';
import type { OnRenderFn } from '../shared/component.public';
import { assertDefined } from '../shared/error/assert';
import type { Props } from '../shared/jsx/jsx-runtime';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { ChoreType, type NodePropPayload } from '../shared/scheduler';
import type { Container, HostElement } from '../shared/types';
import { ELEMENT_PROPS, OnRenderProp, QSubscribers } from '../shared/utils/markers';
import type { ISsrNode } from '../ssr/ssr-types';
import { TaskFlags, isTask } from '../use/use-task';
import { ComputedSignal } from './computed-signal';
import { Signal } from './signal';
import { isSubscriber, type Subscriber } from './signal-subscriber';
import {
  EffectPropData,
  EffectProperty,
  EffectSubscriptionsProp,
  type Effect,
  type EffectSubscriptions,
} from './signal-types';
import type { TargetType } from './store';
import type { WrappedSignal } from './wrapped-signal';

const DEBUG = false;

// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('SIGNAL', ...args.map(qwikDebugToString));

/** Ensure the item is in array (do nothing if already there) */
export const ensureContains = (array: any[], value: any) => {
  const isMissing = array.indexOf(value) === -1;
  if (isMissing) {
    array.push(value);
  }
};

export const ensureContainsEffect = (
  array: EffectSubscriptions[],
  effectSubscriptions: EffectSubscriptions
) => {
  for (let i = 0; i < array.length; i++) {
    const existingEffect = array[i];
    if (
      existingEffect[0] === effectSubscriptions[0] &&
      existingEffect[1] === effectSubscriptions[1]
    ) {
      return;
    }
  }
  array.push(effectSubscriptions);
};

export const ensureEffectContainsSubscriber = (
  effect: Effect,
  subscriber: Subscriber,
  container: Container | null
) => {
  if (isSubscriber(effect)) {
    effect.$effectDependencies$ ||= [];

    if (subscriberExistInSubscribers(effect.$effectDependencies$, subscriber)) {
      return;
    }

    effect.$effectDependencies$.push(subscriber);
  } else if (vnode_isVNode(effect) && !vnode_isTextVNode(effect)) {
    let subscribers = vnode_getProp<Subscriber[]>(
      effect,
      QSubscribers,
      container ? container.$getObjectById$ : null
    );
    subscribers ||= [];

    if (subscriberExistInSubscribers(subscribers, subscriber)) {
      return;
    }

    subscribers.push(subscriber);
    vnode_setProp(effect, QSubscribers, subscribers);
  } else if (isSSRNode(effect)) {
    let subscribers = effect.getProp(QSubscribers) as Subscriber[];
    subscribers ||= [];

    if (subscriberExistInSubscribers(subscribers, subscriber)) {
      return;
    }

    subscribers.push(subscriber);
    effect.setProp(QSubscribers, subscribers);
  }
};

const isSSRNode = (effect: Effect): effect is ISsrNode => {
  return 'setProp' in effect && 'getProp' in effect && 'removeProp' in effect && 'id' in effect;
};

const subscriberExistInSubscribers = (subscribers: Subscriber[], subscriber: Subscriber) => {
  for (let i = 0; i < subscribers.length; i++) {
    if (subscribers[i] === subscriber) {
      return true;
    }
  }
  return false;
};

export const triggerEffects = (
  container: Container | null,
  signal: Signal | TargetType,
  effects: EffectSubscriptions[] | null
) => {
  if (effects) {
    const scheduleEffect = (effectSubscriptions: EffectSubscriptions) => {
      const effect = effectSubscriptions[EffectSubscriptionsProp.EFFECT];
      const property = effectSubscriptions[EffectSubscriptionsProp.PROPERTY];
      assertDefined(container, 'Container must be defined.');
      if (isTask(effect)) {
        effect.$flags$ |= TaskFlags.DIRTY;
        DEBUG && log('schedule.effect.task', pad('\n' + String(effect), '  '));
        let choreType = ChoreType.TASK;
        if (effect.$flags$ & TaskFlags.VISIBLE_TASK) {
          choreType = ChoreType.VISIBLE;
        } else if (effect.$flags$ & TaskFlags.RESOURCE) {
          choreType = ChoreType.RESOURCE;
        }
        container.$scheduler$(choreType, effect);
      } else if (effect instanceof Signal) {
        // we don't schedule ComputedSignal/DerivedSignal directly, instead we invalidate it and
        // and schedule the signals effects (recursively)
        if (effect instanceof ComputedSignal) {
          // Ensure that the computed signal's QRL is resolved.
          // If not resolved schedule it to be resolved.
          if (!effect.$computeQrl$.resolved) {
            container.$scheduler$(ChoreType.QRL_RESOLVE, null, effect.$computeQrl$);
          }
        }

        (effect as ComputedSignal<unknown> | WrappedSignal<unknown>).$invalidate$();
      } else if (property === EffectProperty.COMPONENT) {
        const host: HostElement = effect as any;
        const qrl = container.getHostProp<QRLInternal<OnRenderFn<unknown>>>(host, OnRenderProp);
        assertDefined(qrl, 'Component must have QRL');
        const props = container.getHostProp<Props>(host, ELEMENT_PROPS);
        container.$scheduler$(ChoreType.COMPONENT, host, qrl, props);
      } else if (property === EffectProperty.VNODE) {
        const host: HostElement = effect as any;
        const target = host;
        container.$scheduler$(ChoreType.NODE_DIFF, host, target, signal as Signal);
      } else {
        const host: HostElement = effect as any;
        const effectData = effectSubscriptions[EffectSubscriptionsProp.FIRST_BACK_REF_OR_DATA];
        if (effectData instanceof EffectPropData) {
          const data = effectData.data;
          const payload: NodePropPayload = {
            ...data,
            $value$: signal as Signal,
          };
          container.$scheduler$(ChoreType.NODE_PROP, host, property, payload);
        }
      }
    };
    effects.forEach(scheduleEffect);
  }

  DEBUG && log('done scheduling');
};
