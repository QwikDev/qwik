import { cleanupDeps } from './cleanup';
import { ReactiveFlags } from './flags';
import type { Dependency } from './source';
import { SubscriberKind, type ComputedSubscriber, type Subscriber } from './subscriber';
import { runWithCollector, track } from './tracking';

export class Computed<T> implements ComputedSubscriber<T> {
  readonly kind = SubscriberKind.Computed;
  v!: T;
  version = 0;
  subs: Subscriber[] | null = null;
  deps: Dependency[] | null = null;
  depVersions: number[] | null = null;
  flags = ReactiveFlags.Dirty;

  constructor(readonly compute: () => T) {}

  get value(): T {
    return readComputed(this);
  }

  get untrackedValue(): T {
    return readComputedUntracked(this);
  }

  notify(): void {
    markComputedDirty(this);
  }

  trigger(): void {
    notifySubscribers(this);
  }
}

export function createComputed<T>(compute: () => T): Computed<T> {
  return new Computed(compute);
}

export function readComputed<T>(computed: ComputedSubscriber<T>): T {
  track(computed);
  return readComputedUntracked(computed);
}

export function readComputedUntracked<T>(computed: ComputedSubscriber<T>): T {
  if (computed.flags & ReactiveFlags.Dirty || depsChanged(computed)) {
    recomputeComputed(computed);
  }

  return computed.v;
}

export function markComputedDirty(computed: ComputedSubscriber): void {
  if (computed.flags & ReactiveFlags.Dirty) {
    return;
  }

  computed.flags |= ReactiveFlags.Dirty;
  notifySubscribers(computed);
}

function notifySubscribers(computed: ComputedSubscriber): void {
  const subs = computed.subs;
  if (subs === null) {
    return;
  }

  const snapshot = subs.slice();
  for (let i = 0; i < snapshot.length; i++) {
    snapshot[i].notify();
  }
}

function recomputeComputed<T>(computed: ComputedSubscriber<T>): void {
  if (computed.flags & ReactiveFlags.Computing) {
    throw new Error('Circular computed dependency');
  }

  cleanupDeps(computed);
  computed.flags |= ReactiveFlags.Computing;

  try {
    const oldValue = computed.v;
    const nextValue = runWithCollector(computed, () => computed.compute());

    computed.flags &= ~ReactiveFlags.Dirty;
    computed.v = nextValue;

    if (!Object.is(oldValue, nextValue)) {
      computed.version++;
    }
  } finally {
    computed.flags &= ~ReactiveFlags.Computing;
  }
}

function depsChanged(collector: ComputedSubscriber): boolean {
  const deps = collector.deps;
  const depVersions = collector.depVersions;
  if (deps === null || depVersions === null) {
    return false;
  }

  for (let i = 0; i < deps.length; i++) {
    if (deps[i].version !== depVersions[i]) {
      return true;
    }
  }

  return false;
}
