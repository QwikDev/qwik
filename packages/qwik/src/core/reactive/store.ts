import type { Source, SourceSubs } from './source';
import { notifySourceSubscribers } from './notify';
import { track, untrack } from './tracking';

/** @public */
export type Store<T extends object> = T;

/** @public */
export interface UseStoreOptions {
  deep?: boolean;
  reactive?: boolean;
}

type StoreTarget = Record<PropertyKey, unknown>;

const rawToProxy = new WeakMap<object, object>();
const rawToShallowProxy = new WeakMap<object, object>();
const proxyToRaw = new WeakMap<object, object>();
const rawToSources = new WeakMap<object, Map<PropertyKey, StorePropSource>>();

export class StorePropSource<T = unknown> implements Source<T> {
  version = 0;
  subs: SourceSubs = null;

  constructor(
    public target: StoreTarget = {},
    public prop: PropertyKey = ''
  ) {}

  get v(): T {
    return this.target[this.prop] as T;
  }

  set v(value: T) {
    this.target[this.prop] = value;
  }

  notify(): void {
    this.version++;
    notifySourceSubscribers(this);
  }
}

/** @public */
export function useStore<T extends object>(
  initialState: T | (() => T),
  options?: UseStoreOptions
): Store<T> {
  const value =
    typeof initialState === 'function' ? untrack(initialState as () => T) : initialState;
  if (options?.reactive === false) {
    return value;
  }
  if (!isWrappable(value)) {
    return value;
  }
  return options?.deep === false ? getOrCreateShallowStore(value) : getOrCreateDeepStore(value);
}

function getOrCreateDeepStore<T extends object>(value: T): Store<T> {
  const raw = unwrapStore(value);
  let proxy = rawToProxy.get(raw);
  if (proxy === undefined) {
    proxy = new Proxy(raw as StoreTarget, storeHandler);
    rawToProxy.set(raw, proxy);
    proxyToRaw.set(proxy, raw);
  }
  return proxy as Store<T>;
}

function getOrCreateShallowStore<T extends object>(value: T): Store<T> {
  const raw = unwrapStore(value);
  let proxy = rawToShallowProxy.get(raw);
  if (proxy === undefined) {
    proxy = new Proxy(raw as StoreTarget, shallowStoreHandler);
    rawToShallowProxy.set(raw, proxy);
    proxyToRaw.set(proxy, raw);
  }
  return proxy as Store<T>;
}

/** @public */
export function unwrapStore<T>(value: T): T {
  return (isObject(value) ? (proxyToRaw.get(value) ?? value) : value) as T;
}

/** @public */
export function forceStoreEffects<T extends object>(value: T, prop: keyof T): void {
  const raw = proxyToRaw.get(value);
  if (raw !== undefined) {
    notifyStoreProp(raw as StoreTarget, prop);
  }
}

export function hasStoreEffects<T extends object>(value: T, prop: keyof T): boolean {
  const raw = proxyToRaw.get(value);
  return raw !== undefined && rawToSources.get(raw)?.get(prop)?.subs != null;
}

export function isStore(value: unknown): boolean {
  return isObject(value) && proxyToRaw.has(value);
}

export function isDeepStore(value: object): boolean {
  const raw = proxyToRaw.get(value)!;
  return rawToProxy.get(raw) === value;
}

export function getStoreSource<T = unknown>(target: object, prop: PropertyKey): StorePropSource<T> {
  const raw = unwrapStore(target) as StoreTarget;
  let source = rawToSources.get(raw)?.get(prop);
  if (source === undefined) {
    source = bindStoreSource(new StorePropSource(), raw, prop);
  }
  return source as StorePropSource<T>;
}

export function bindStoreSource<T>(
  source: StorePropSource<T>,
  target: object,
  prop: PropertyKey
): StorePropSource<T> {
  const raw = unwrapStore(target) as StoreTarget;
  let sources = rawToSources.get(raw);
  if (sources === undefined) {
    sources = new Map();
    rawToSources.set(raw, sources);
  }
  const existing = sources.get(prop);
  if (existing !== undefined && existing !== source) {
    source.version = existing.version;
    source.subs = existing.subs;
  }
  source.target = raw;
  source.prop = prop;
  sources.set(prop, source);
  return source;
}

export function getStoreSources(target: object): Iterable<StorePropSource> {
  return rawToSources.get(unwrapStore(target) as object)?.values() ?? [];
}

const storeHandler: ProxyHandler<StoreTarget> = {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof prop !== 'symbol') {
      track(getStoreSource(target, prop));
    }
    return isWrappable(value) ? getOrCreateDeepStore(value) : value;
  },

  set(target, prop, value) {
    const oldLength = Array.isArray(target) ? target.length : -1;
    const had = Object.prototype.hasOwnProperty.call(target, prop);
    const oldValue = target[prop];
    const nextValue = unwrapStore(value);

    target[prop] = nextValue;

    if (
      (!had || !Object.is(oldValue, nextValue)) &&
      (!Array.isArray(target) || prop !== 'length')
    ) {
      notifyStoreProp(target, prop);
    }

    notifyArrayLengthChanges(target, prop, oldLength);
    return true;
  },

  deleteProperty(target, prop) {
    const had = Object.prototype.hasOwnProperty.call(target, prop);
    if (!Reflect.deleteProperty(target, prop)) {
      return false;
    }
    if (had) {
      notifyStoreProp(target, prop);
    }
    return true;
  },

  has(target, prop) {
    if (typeof prop !== 'symbol') {
      track(getStoreSource(target, prop));
    }
    return prop in target;
  },

  getOwnPropertyDescriptor(target, prop) {
    return Reflect.getOwnPropertyDescriptor(target, prop);
  },
};

const shallowStoreHandler: ProxyHandler<StoreTarget> = {
  ...storeHandler,
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof prop !== 'symbol') {
      track(getStoreSource(target, prop));
    }
    return value;
  },
};

function notifyStoreProp(target: StoreTarget, prop: PropertyKey): void {
  rawToSources.get(target)?.get(prop)?.notify();
}

function notifyArrayLengthChanges(target: StoreTarget, prop: PropertyKey, oldLength: number): void {
  if (!Array.isArray(target) || oldLength === target.length) {
    return;
  }

  notifyStoreProp(target, 'length');
  if (prop !== 'length') {
    return;
  }

  const sources = rawToSources.get(target);
  if (sources === undefined) {
    return;
  }
  for (const source of sources.values()) {
    if (isArrayIndex(source.prop)) {
      const index = Number(source.prop);
      if (index >= target.length && index < oldLength) {
        source.notify();
      }
    }
  }
}

function isArrayIndex(prop: PropertyKey): boolean {
  if (typeof prop === 'number') {
    return Number.isInteger(prop) && prop >= 0;
  }
  if (typeof prop !== 'string') {
    return false;
  }
  const value = Number(prop);
  return String(value) === prop && Number.isInteger(value) && value >= 0;
}

function isWrappable(value: unknown): value is object {
  if (!isObject(value)) {
    return false;
  }
  if (proxyToRaw.has(value)) {
    return true;
  }
  const proto = Object.getPrototypeOf(value);
  return Array.isArray(value) || proto === Object.prototype || proto === null;
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' || typeof value === 'function') && value !== null;
}
