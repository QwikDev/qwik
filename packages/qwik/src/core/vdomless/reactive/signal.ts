import { resolveLazySubscribers } from './lazy-serialized';
import type { Source, SourceSubs } from './source';
import { SubscriberKind, type PhaseSubscriber, type Subscriber } from '../runtime/subscriber';
import { notifyPhaseSubscriber } from '../runtime/scheduler';
import { markComputedDirty } from './computed';
import { track } from './tracking';

export class Signal<T> implements Source<T> {
  v: T;
  version = 0;
  subs: SourceSubs = null;

  constructor(value: T) {
    this.v = value;
  }

  get value(): T {
    track(this);
    return this.v;
  }

  set value(next: T) {
    if (Object.is(this.v, next)) {
      return;
    }

    this.v = next;
    this.version++;
    this.notifySubscribers();
  }

  get untrackedValue(): T {
    return this.v;
  }

  set untrackedValue(next: T) {
    this.v = next;
  }

  trigger(): void {
    this.notifySubscribers();
  }

  private notifySubscribers(): void {
    if (resolveLazySubscribers(this, () => this.notifySubscribers())) {
      return;
    }

    const subs = this.subs;
    if (subs === null) {
      return;
    }

    const snapshot = subs.slice() as Subscriber[];
    for (let i = 0; i < snapshot.length; i++) {
      const subscriber = snapshot[i];
      if (subscriber.kind === SubscriberKind.Computed) {
        markComputedDirty(subscriber);
      } else {
        notifyPhaseSubscriber(subscriber as PhaseSubscriber);
      }
    }
  }
}

export function createSignal<T>(): Signal<T | undefined>;
export function createSignal<T>(value: T): Signal<T>;
export function createSignal<T>(value?: T): Signal<T | undefined> {
  return new Signal(value);
}
