import type { Source } from './source';
import type { Subscriber } from '../runtime/subscriber';
import { track } from './tracking';

export class Signal<T> implements Source<T> {
  v: T;
  version = 0;
  subs: Subscriber[] | null = null;

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
    const subs = this.subs;
    if (subs === null) {
      return;
    }

    const snapshot = subs.slice();
    for (let i = 0; i < snapshot.length; i++) {
      snapshot[i].notify();
    }
  }
}

export function createSignal<T>(): Signal<T | undefined>;
export function createSignal<T>(value: T): Signal<T>;
export function createSignal<T>(value?: T): Signal<T | undefined> {
  return new Signal(value);
}
