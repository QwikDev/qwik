import type { Source, SourceSubs } from './source';
import { notifySourceSubscribers } from './notify';
import { dropWriterDependency } from './cleanup';
import { track } from './tracking';

/** @public */
export class Signal<T> implements Source<T> {
  v: T;
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
    dropWriterDependency(this);
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

  /** Hides the internals, whose subscriber graph is circular. */
  toJSON(): { value: T } {
    return { value: this.v };
  }
}
