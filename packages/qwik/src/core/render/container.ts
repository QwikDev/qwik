import { assertTrue } from '../assert/assert';
import type { Signal } from '../object/q-object';
import type { GetObject, GetObjID } from '../object/store';
import type { SubscriberEffect, SubscriberHost } from '../use/use-watch';
import { seal } from '../util/qdev';
import { notifyChange } from './dom/notify-render';
import type { QwikElement } from './dom/virtual-element';
import type { RenderStaticContext } from './types';

export type ObjToProxyMap = WeakMap<any, any>;

export interface SubscriptionManager {
  $createManager$(map?: Subscriptions[]): LocalSubscriptionManager;
  $clearSub$: (sub: SubscriberEffect | SubscriberHost) => void;
}

export interface LocalSubscriptionManager {
  readonly $subs$: Subscriptions[];
  $notifySubs$: (key?: string | undefined) => void;
  $unsubGroup$: (group: SubscriberEffect | SubscriberHost) => void;
  $addSub$: (subscription: Subscriptions) => void;
}

/**
 * @alpha
 */
export interface ContainerState {
  $containerEl$: Element;

  $proxyMap$: ObjToProxyMap;
  $subsManager$: SubscriptionManager;

  $watchNext$: Set<SubscriberEffect>;
  $watchStaging$: Set<SubscriberEffect>;

  $opsNext$: Set<SubscriberSignal>;

  $hostsNext$: Set<QwikElement>;
  $hostsStaging$: Set<QwikElement>;
  $hostsRendering$: Set<QwikElement> | undefined;
  $renderPromise$: Promise<RenderStaticContext> | undefined;

  $envData$: Record<string, any>;
  $elementIndex$: number;

  $styleIds$: Set<string>;
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

    $proxyMap$: new WeakMap(),
    $subsManager$: null as any,

    $opsNext$: new Set(),

    $watchNext$: new Set(),
    $watchStaging$: new Set(),

    $hostsNext$: new Set(),
    $hostsStaging$: new Set(),
    $renderPromise$: undefined,
    $hostsRendering$: undefined,

    $envData$: {},
    $elementIndex$: 0,

    $styleIds$: new Set(),
  };
  seal(containerState);
  containerState.$subsManager$ = createSubscriptionManager(containerState);
  return containerState;
};

type A = [type: 0, subscriber: SubscriberEffect | SubscriberHost, key?: string];

type B = [
  type: 1,
  subscriber: SubscriberHost,
  signal: Signal,
  elm: QwikElement | Node,
  prop: string
];

type C = [type: 2, subscriber: SubscriberHost, signal: Signal, elm: QwikElement, attribute: string];

export type SubscriberSignal = B | C;

export type Subscriptions = A | SubscriberSignal;

export type GroupToManagersMap = Map<SubscriberHost | SubscriberEffect, LocalSubscriptionManager[]>;

export const serializeSubscription = (sub: Subscriptions, getObjId: GetObjID) => {
  const type = sub[0];
  const host = sub[1];
  let base = type + ' ' + getObjId(host);
  if (sub[0] === 0) {
    if (sub[2]) {
      base += ' ' + sub[2];
    }
  } else {
    const nodeID = typeof sub[3] === 'string' ? sub[3] : getObjId(sub[3]);
    base += ` ${getObjId(sub[2])} ${nodeID} ${sub[4]}`;
  }
  return base;
};

export const parseSubscription = (sub: string, getObject: GetObject) => {
  const parts = sub.split(' ');
  const type = parseInt(parts[0], 10);
  assertTrue(parts.length >= 2, 'At least 2 parts');
  const subscription = [type, getObject(parts[1])] as Subscriptions;
  if (type === 0) {
    assertTrue(parts.length <= 3, 'Max 3 parts');
    if (parts.length === 3) {
      subscription.push(parts[2]);
    }
  } else {
    assertTrue(parts.length === 5, 'Max 3 parts');
    subscription.push(getObject(parts[2]), getObject(parts[3]), parts[4]);
  }
  return subscription;
};

export const createSubscriptionManager = (containerState: ContainerState): SubscriptionManager => {
  const groupToManagers: GroupToManagersMap = new Map();
  // const hostToSub: HostToSubscriberMap = new Map();

  const clearSub = (group: SubscriberHost | SubscriberEffect) => {
    const managers = groupToManagers.get(group);
    if (managers) {
      for (const manager of managers) {
        manager.$unsubGroup$(group);
      }
      groupToManagers.delete(group);
      managers.length = 0;
    }
  };

  const addToGroup = (
    group: SubscriberHost | SubscriberEffect,
    manager: LocalSubscriptionManager
  ) => {
    let managers = groupToManagers.get(group);
    if (!managers) {
      groupToManagers.set(group, (managers = []));
    }
    if (!managers.includes(manager)) {
      managers.push(manager);
    }
  };

  const createManager = (initialMap?: Subscriptions[]) => {
    const map = initialMap ? initialMap : [];
    const local: LocalSubscriptionManager = {
      $subs$: map,
      $unsubGroup$(group) {
        for (let i = 0; i < map.length; i++) {
          const found = map[i][1] === group;
          if (found) {
            map.splice(i, 1);
            i--;
          }
        }
      },
      $addSub$(sub: Subscriptions) {
        const [type, group, key] = sub;
        if (type === 0 || type === 1) {
          if (
            map.some(([_type, _group, _key]) => _type === type && _group === group && _key === key)
          ) {
            return;
          }
        }
        map.push(sub);
        addToGroup(group, local);
      },
      $notifySubs$(key?: string) {
        for (const sub of map) {
          if (sub[0] === 0 && sub[2] !== key) {
            continue;
          }
          notifyChange(sub, containerState);
        }
      },
    };
    seal(local);
    for (const sub of map) {
      addToGroup(sub[1], local);
    }
    return local;
  };

  const manager: SubscriptionManager = {
    $createManager$: createManager,
    $clearSub$: clearSub,
  };
  seal(manager);
  return manager;
};
