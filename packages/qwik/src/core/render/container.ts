import { assertTrue } from '../assert/assert';
import { qError, QError_invalidRefValue } from '../error/error';
import type { Signal } from '../object/q-object';
import { getEventName, GetObject, GetObjID } from '../object/store';
import { isServer } from '../platform/platform';
import type { Ref } from '../use/use-ref';
import type { SubscriberEffect, SubscriberHost } from '../use/use-watch';
import { logError, logWarn } from '../util/log';
import { qSerialize, qTest, seal } from '../util/qdev';
import { isFunction, isObject } from '../util/types';
import { notifyChange } from './dom/notify-render';
import type { QwikElement } from './dom/virtual-element';
import type { RenderStaticContext } from './types';

export type ObjToProxyMap = WeakMap<any, any>;

export interface SubscriptionManager {
  $createManager$(map?: Subscriptions[]): LocalSubscriptionManager;
  $clearSub$: (sub: SubscriberEffect | SubscriberHost) => void;
}
/**
 * @alpha
 */
export interface ContainerState {
  readonly $containerEl$: Element;

  readonly $proxyMap$: ObjToProxyMap;
  $subsManager$: SubscriptionManager;

  readonly $watchNext$: Set<SubscriberEffect>;
  readonly $watchStaging$: Set<SubscriberEffect>;

  readonly $opsNext$: Set<SubscriberSignal>;

  readonly $hostsNext$: Set<QwikElement>;
  readonly $hostsStaging$: Set<QwikElement>;
  $hostsRendering$: Set<QwikElement> | undefined;
  $renderPromise$: Promise<RenderStaticContext> | undefined;

  $envData$: Record<string, any>;
  $elementIndex$: number;

  readonly $styleIds$: Set<string>;
  readonly $events$: Set<string>;
}

const CONTAINER_STATE = Symbol('ContainerState');

export const getContainerState = (containerEl: Element): ContainerState => {
  let set = (containerEl as any)[CONTAINER_STATE] as ContainerState;
  if (!set) {
    (containerEl as any)[CONTAINER_STATE] = set = createContainerState(containerEl);
  }
  return set;
};

export const createContainerState = (containerEl: Element) => {
  const containerState: ContainerState = {
    $containerEl$: containerEl,

    $elementIndex$: 0,

    $proxyMap$: new WeakMap(),

    $opsNext$: new Set(),

    $watchNext$: new Set(),
    $watchStaging$: new Set(),

    $hostsNext$: new Set(),
    $hostsStaging$: new Set(),

    $styleIds$: new Set(),
    $events$: new Set(),

    $envData$: {},
    $renderPromise$: undefined,
    $hostsRendering$: undefined,
    $subsManager$: null as any,
  };
  seal(containerState);
  containerState.$subsManager$ = createSubscriptionManager(containerState);
  return containerState;
};

type A = [type: 0, subscriber: SubscriberEffect | SubscriberHost, key: string | undefined];

type B = [
  type: 1,
  subscriber: SubscriberHost,
  signal: Record<string, any>,
  elm: QwikElement,
  prop: string,
  key: string | undefined
];

type C = [
  type: 2,
  subscriber: SubscriberHost,
  signal: Record<string, any>,
  elm: Node,
  attribute: string,
  key: string | undefined
];

export type SubscriberSignal = B | C;

export type Subscriptions = A | SubscriberSignal;

export type GroupToManagersMap = Map<SubscriberHost | SubscriberEffect, LocalSubscriptionManager[]>;

export const serializeSubscription = (sub: Subscriptions, getObjId: GetObjID) => {
  const type = sub[0];
  const host = getObjId(sub[1]);
  if (!host) {
    return undefined;
  }
  let base = type + ' ' + host;
  if (sub[0] === 0) {
    if (sub[2]) {
      base += ' ' + sub[2];
    }
  } else {
    const nodeID = typeof sub[3] === 'string' ? sub[3] : must(getObjId(sub[3]));
    base += ` ${must(getObjId(sub[2]))} ${nodeID} ${sub[4]}`;
    if (sub[5]) {
      base += ` ${sub[5]}`;
    }
  }
  return base;
};

export const parseSubscription = (sub: string, getObject: GetObject): Subscriptions => {
  const parts = sub.split(' ');
  const type = parseInt(parts[0], 10);
  assertTrue(parts.length >= 2, 'At least 2 parts');
  const subscription = [type, getObject(parts[1])];
  if (type === 0) {
    assertTrue(parts.length <= 3, 'Max 3 parts');
    subscription.push(parts[2]);
  } else {
    assertTrue(parts.length === 5 || parts.length === 6, 'Max 5 parts');
    subscription.push(getObject(parts[2]), getObject(parts[3]), parts[4], parts[5]);
  }
  return subscription as any;
};

export const createSubscriptionManager = (containerState: ContainerState): SubscriptionManager => {
  const groupToManagers: GroupToManagersMap = new Map();
  const manager: SubscriptionManager = {
    $createManager$: (initialMap?: Subscriptions[]) => {
      return new LocalSubscriptionManager(groupToManagers, containerState, initialMap);
    },
    $clearSub$: (group: SubscriberHost | SubscriberEffect) => {
      const managers = groupToManagers.get(group);
      if (managers) {
        for (const manager of managers) {
          manager.$unsubGroup$(group);
        }
        groupToManagers.delete(group);
        managers.length = 0;
      }
    },
  };
  seal(manager);
  return manager;
};

export class LocalSubscriptionManager {
  readonly $subs$: Subscriptions[];

  constructor(
    private $groupToManagers$: GroupToManagersMap,
    private $containerState$: ContainerState,
    initialMap?: Subscriptions[]
  ) {
    this.$subs$ = [];

    if (initialMap) {
      this.$addSubs$(initialMap);
    }
    seal(this);
  }

  $addSubs$(subs: Subscriptions[]) {
    this.$subs$.push(...subs);
    for (const sub of this.$subs$) {
      this.$addToGroup$(sub[1], this);
    }
  }

  $addToGroup$(group: SubscriberHost | SubscriberEffect, manager: LocalSubscriptionManager) {
    let managers = this.$groupToManagers$.get(group);
    if (!managers) {
      this.$groupToManagers$.set(group, (managers = []));
    }
    if (!managers.includes(manager)) {
      managers.push(manager);
    }
  }

  $unsubGroup$(group: SubscriberEffect | SubscriberHost) {
    const subs = this.$subs$;
    for (let i = 0; i < subs.length; i++) {
      const found = subs[i][1] === group;
      if (found) {
        subs.splice(i, 1);
        i--;
      }
    }
  }

  $addSub$(sub: Subscriptions) {
    const subs = this.$subs$;

    const [type, group] = sub;
    const key = sub[sub.length - 1] as string | undefined;
    if (type === 0) {
      if (
        subs.some(([_type, _group, _key]) => _type === type && _group === group && _key === key)
      ) {
        return;
      }
    }
    subs.push(sub);
    this.$addToGroup$(group, this);
  }

  $notifySubs$(key?: string | undefined) {
    const subs = this.$subs$;
    for (const sub of subs) {
      const compare = sub[sub.length - 1];
      if (key && compare && compare !== key) {
        continue;
      }
      notifyChange(sub, this.$containerState$);
    }
  }
}

export const setRef = (value: any, elm: Element) => {
  if (isFunction(value)) {
    return value(elm);
  } else if (isObject(value)) {
    if ('current' in value) {
      return ((value as Ref<Element>).current = elm);
    } else if ('value' in value) {
      return ((value as Signal<Element>).value = elm);
    }
  }
  throw qError(QError_invalidRefValue, value);
};

const must = <T>(a: T): NonNullable<T> => {
  if (a == null) {
    throw logError('must be non null', a);
  }
  return a;
};

export const addQwikEvent = (prop: string, containerState: ContainerState) => {
  const eventName = getEventName(prop);
  if (!qTest && !isServer()) {
    try {
      if ((window as any).qwikevents) {
        (window as any).qwikevents.push(eventName);
      }
    } catch (err) {
      logWarn(err);
    }
  }
  if (qSerialize) {
    containerState.$events$.add(eventName);
  }
};
