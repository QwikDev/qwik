import { isPromise, maybeThen } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import type { Scheduler } from '../runtime/scheduler';
import type { Subscriber } from '../runtime/subscriber';
import type { Source, SourceSub } from './source';
import { toArrayIndex } from '../utils/array';

export class LazySerialized<T> {
  private promise: Promise<T> | null = null;
  private resolved = false;
  private value: T | undefined;

  constructor(
    private readonly loader: () => ValueOrPromise<T>,
    readonly scheduler: Scheduler | null = null
  ) {}

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

/** Marks a resumed subscriber list whose entries are created on first access. */
class LazySourceSubs extends Array<SourceSub> {}

export function createLazySourceSubs(
  length: number,
  create: (index: number) => SourceSub
): SourceSub[] {
  return new Proxy(new LazySourceSubs(length), new LazySourceSubsHandler(create));
}

/** Await notification so it can register further lazy loads; false means notify now. */
export function resolveLazySubscribers(source: Source, notify: (source: Source) => void): boolean {
  const subs = source.subs;
  if (subs === null) {
    return false;
  }

  if (!Array.isArray(subs)) {
    if (!isLazySerialized<Subscriber>(subs)) {
      return false;
    }
    const value = maybeThen(subs.resolve(), (subscriber) => {
      if (source.subs === subs) {
        source.subs = subscriber;
      }
      return subscriber;
    });
    if (!isPromise(value)) {
      return false;
    }
    subs.scheduler?.waitForResume(value.then(() => notify(source)));
    return true;
  }

  // Materialize the proxy once so later writes, tracks and removals use a plain array.
  const list = subs instanceof LazySourceSubs ? (source.subs = Array.from(subs)) : subs;
  let pending: Array<Promise<Subscriber>> | null = null;
  let scheduler: Scheduler | null = null;
  for (let i = 0; i < list.length; i++) {
    const sub = list[i];
    if (!isLazySerialized<Subscriber>(sub)) {
      continue;
    }
    scheduler ??= sub.scheduler;
    const value = maybeThen(sub.resolve(), (subscriber) =>
      replaceLazySubscriber(source, list, sub, subscriber)
    );
    if (isPromise<Subscriber>(value)) {
      (pending ??= []).push(value);
    }
  }

  if (pending === null) {
    return false;
  }
  scheduler?.waitForResume(Promise.all(pending).then(() => notify(source)));
  return true;
}

export function resolveLazySourceSubscriber(
  source: Source,
  lazy: LazySerialized<Subscriber>
): ValueOrPromise<Subscriber> {
  return maybeThen(lazy.resolve(), (subscriber) => {
    const subs = source.subs;
    if (subs === lazy) {
      source.subs = subscriber;
    } else if (Array.isArray(subs)) {
      replaceLazySubscriber(source, subs, lazy, subscriber);
    }
    return subscriber;
  });
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
  if (subs.length === 1) {
    source.subs = subs[0];
  }
  return subscriber;
}

class LazySourceSubsHandler implements ProxyHandler<SourceSub[]> {
  constructor(private readonly create: (index: number) => SourceSub) {}

  get(target: SourceSub[], property: PropertyKey, receiver: object): unknown {
    const index = toLazyIndex(target, property);
    if (index !== -1 && !Object.prototype.hasOwnProperty.call(target, property)) {
      target[index] = this.create(index);
    }
    return Reflect.get(target, property, receiver);
  }

  has(target: SourceSub[], property: PropertyKey): boolean {
    return toLazyIndex(target, property) !== -1 || Reflect.has(target, property);
  }
}

/** Entries pushed past the resumed length are own properties, so the length bounds them too. */
function toLazyIndex(target: SourceSub[], property: PropertyKey): number {
  const index = toArrayIndex(property);
  return index < target.length ? index : -1;
}
