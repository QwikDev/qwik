import { isPromise, maybeThen } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import type { Subscriber } from '../runtime/subscriber';
import type { Source, SourceSub } from './source';

const MAX_ARRAY_INDEX_EXCLUSIVE = 0xffffffff;

export class LazySerialized<T> {
  private promise: Promise<T> | null = null;
  private resolved = false;
  private value: T | undefined;

  constructor(private readonly loader: () => ValueOrPromise<T>) {}

  get isResolved(): boolean {
    return this.resolved;
  }

  peek(): T | undefined {
    return this.resolved ? this.value : undefined;
  }

  resolve(): ValueOrPromise<T> {
    if (this.resolved) {
      return this.value as T;
    }
    if (this.promise === null) {
      const value = maybeThen(this.loader(), (value) => {
        this.value = value;
        this.resolved = true;
        return value;
      });
      if (!isPromise<T>(value)) {
        return value;
      }
      this.promise = value;
    }
    return this.promise;
  }
}

export function isLazySerialized<T>(value: unknown): value is LazySerialized<T> {
  return value instanceof LazySerialized;
}

export function createLazySourceSubs(
  length: number,
  create: (index: number) => SourceSub
): SourceSub[] {
  return new Proxy(new Array<SourceSub>(length), new LazySourceSubsHandler(length, create));
}

export function resolveLazySubscribers(source: Source, notify: () => void): boolean {
  const subs = source.subs;
  if (subs === null) {
    return false;
  }

  let pending: Array<Promise<Subscriber>> | null = null;
  let resolved = false;
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    if (!isLazySerialized<Subscriber>(sub)) {
      continue;
    }
    resolved = true;
    const value = maybeThen(sub.resolve(), (subscriber) =>
      replaceLazySubscriber(source, subs, sub, subscriber)
    );
    if (isPromise<Subscriber>(value)) {
      pending ??= [];
      pending.push(value);
    }
  }

  if (!resolved) {
    return false;
  }

  if (pending === null) {
    notify();
  } else {
    void Promise.all(pending).then(notify);
  }
  return true;
}

function replaceLazySubscriber(
  source: Source,
  subs: SourceSub[],
  sub: LazySerialized<Subscriber>,
  subscriber: Subscriber
): Subscriber {
  if (source.subs !== subs) {
    return subscriber;
  }
  const lazyIndex = subs.indexOf(sub);
  if (lazyIndex === -1) {
    return subscriber;
  }
  subs[lazyIndex] = subscriber;
  const duplicateIndex = subs.indexOf(subscriber, lazyIndex + 1);
  if (duplicateIndex !== -1) {
    subs.splice(duplicateIndex, 1);
  }
  return subscriber;
}

class LazySourceSubsHandler implements ProxyHandler<SourceSub[]> {
  constructor(
    private readonly length: number,
    private readonly create: (index: number) => SourceSub
  ) {}

  get(target: SourceSub[], property: PropertyKey, receiver: object): unknown {
    const index = toArrayIndex(property);
    if (index !== -1 && index < this.length && index < target.length) {
      if (!Object.prototype.hasOwnProperty.call(target, property)) {
        target[index] = this.create(index);
      }
      return target[index];
    }
    return Reflect.get(target, property, receiver);
  }

  has(target: SourceSub[], property: PropertyKey): boolean {
    const index = toArrayIndex(property);
    return (
      (index !== -1 && index < this.length && index < target.length) ||
      Reflect.has(target, property)
    );
  }
}

function toArrayIndex(property: PropertyKey): number {
  if (typeof property === 'number') {
    return isArrayIndex(property) ? property : -1;
  }
  if (typeof property !== 'string') {
    return -1;
  }
  const index = Number(property);
  return String(index) === property && isArrayIndex(index) ? index : -1;
}

function isArrayIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < MAX_ARRAY_INDEX_EXCLUSIVE;
}
