import { getQObjectId, QObject_addDoc } from '../object/q-object';
import type { Observer } from './watch.public';

export type Subscriptions = Map<{}, { value: any; proxy: SubscribeProxy<any> }>;

export function createWatchFnObserver(
  doc: Document
): Observer & { getGuard(): Map<string, string[]> } {
  const subscriptions: Subscriptions = new Map();
  function wrap<T>(obj: T): T {
    const id = getQObjectId(obj);
    if (!id) {
      throw new Error('Q-ERROR: only object stores can be observed.');
    }
    const obs = subscriptions.get(obj);
    if (obs) {
      return obs.value;
    }
    QObject_addDoc(obj, doc);
    const proxy = new SubscribeProxy<any>(obj, subscriptions, wrap);
    const value = new Proxy(obj, proxy);
    subscriptions.set(obj, { value, proxy });
    return value;
  }
  wrap.getGuard = function () {
    const map = new Map();
    subscriptions.forEach((value, key) => {
      const props = value.proxy.properties;
      return props && map.set(getQObjectId(key)!, Array.from(props));
    });
    return map;
  };
  return wrap;
}

export class SubscribeProxy<T extends Record<string, any>> {
  public properties: Set<string> | null = null;

  constructor(public obj: {}, public subscriptions: Subscriptions, public wrap: Observer) {}

  get(target: T, prop: string): any {
    let value = target[prop];
    const props = this.properties || (this.properties = new Set());
    props.add(prop);
    if (typeof value == 'object' && value != null) {
      value = this.wrap(value);
    }
    return value;
  }

  set(target: T, prop: string, newValue: any): boolean {
    throw new Error('Writing to observables is not allowed! Property: ' + prop + ' ' + newValue);
    // return true;
  }

  has(target: T, property: string | symbol) {
    return Object.prototype.hasOwnProperty.call(target, property);
  }

  ownKeys(target: T): ArrayLike<string | symbol> {
    return Object.getOwnPropertyNames(target);
  }
}
