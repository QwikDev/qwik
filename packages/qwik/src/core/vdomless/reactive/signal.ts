import type { Source, SourceSubs } from './source';
import { notifySourceSubscribers } from './notify';
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
    notifySourceSubscribers(this);
  }

  get untrackedValue(): T {
    return this.v;
  }

  set untrackedValue(next: T) {
    this.v = next;
  }

  trigger(): void {
    notifySourceSubscribers(this);
  }
}

export function useSignal<T>(): Signal<T | undefined>;
export function useSignal<T>(value: T): Signal<T>;
export function useSignal<T>(value?: T): Signal<T | undefined> {
  return new Signal(value);
}
