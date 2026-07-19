import { cleanupDeps } from './cleanup';
import { ComputedFlags } from './flags';
import type { Source, SourceSubs } from './source';
import { SubscriberKind, type ComputedSubscriber } from '../runtime/subscriber';
import { runWithCollector, track } from './tracking';
import type { Owner } from '../runtime/owner';
import { notifySourceSubscribers } from './notify';

export class Computed<T> implements ComputedSubscriber<T> {
  readonly kind = SubscriberKind.Computed;
  owner: Owner | null = null;
  v!: T;
  version = 0;
  subs: SourceSubs = null;
  deps: Source[] | null = null;
  depVersions: number[] | null = null;
  flags = ComputedFlags.Dirty;

  constructor(readonly compute: () => T) {}

  get value(): T {
    return readComputed(this);
  }

  get untrackedValue(): T {
    return readComputedUntracked(this);
  }

  trigger(): void {
    notifySourceSubscribers(this);
  }
}

export function readComputed<T>(computed: ComputedSubscriber<T>): T {
  if (computed.owner === null) {
    return readDisposedComputed(computed);
  }

  track(computed);
  return readComputedUntracked(computed);
}

export function readComputedUntracked<T>(computed: ComputedSubscriber<T>): T {
  if (computed.owner === null) {
    return readDisposedComputed(computed);
  }

  if (computed.flags & ComputedFlags.Dirty || depsChanged(computed)) {
    recomputeComputed(computed);
  }

  return computed.v;
}

function recomputeComputed<T>(computed: ComputedSubscriber<T>): void {
  if (computed.flags & ComputedFlags.Computing) {
    throw new Error('Circular computed dependency');
  }

  cleanupDeps(computed);
  computed.flags |= ComputedFlags.Computing;

  try {
    const hadValue = computed.flags & ComputedFlags.HasValue;
    const oldValue = computed.v;
    const nextValue = runWithCollector(computed, () => computed.compute());

    computed.flags = (computed.flags & ~ComputedFlags.Dirty) | ComputedFlags.HasValue;
    computed.v = nextValue;

    if (!hadValue || !Object.is(oldValue, nextValue)) {
      computed.version++;
    }
  } finally {
    computed.flags &= ~ComputedFlags.Computing;
  }
}

function readDisposedComputed<T>(computed: ComputedSubscriber<T>): T {
  if (computed.flags & ComputedFlags.HasValue) {
    return computed.v;
  }

  throw new Error('Cannot read disposed computed without cached value');
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
