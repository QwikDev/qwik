import type { Dependency } from './source';
import type { CollectorSubscriber } from './subscriber';

let activeCollector: CollectorSubscriber | null = null;

export function getActiveCollector(): CollectorSubscriber | null {
  return activeCollector;
}

// A collector is the subscriber currently reading sources. Reads inside this
// frame create dependency edges (source -> collector), but they do not imply
// lifetime ownership of subscribers created during the frame.
export function runWithCollector<T>(collector: CollectorSubscriber | null, run: () => T): T;
export function runWithCollector<T, A>(
  collector: CollectorSubscriber | null,
  run: (arg: A) => T,
  arg: A
): T;
export function runWithCollector<T, A>(
  collector: CollectorSubscriber | null,
  run: (() => T) | ((arg: A) => T),
  arg?: A
): T {
  const previous = activeCollector;
  activeCollector = collector;

  try {
    if (arguments.length === 3) {
      return (run as (arg: A) => T)(arg as A);
    }

    return (run as () => T)();
  } finally {
    activeCollector = previous;
  }
}

export function untrack<T>(run: () => T): T {
  return runWithCollector(null, run);
}

export function track(source: Dependency): void {
  const collector = activeCollector;
  if (collector === null || collector === source) {
    return;
  }

  let deps = collector.deps;
  if (deps === null) {
    collector.deps = deps = [];
    collector.depVersions = [];
  }

  for (let i = 0; i < deps.length; i++) {
    if (deps[i] === source) {
      return;
    }
  }

  addDependency(collector, source);
}

export function addDependency(collector: CollectorSubscriber, source: Dependency): void {
  collector.deps!.push(source);
  collector.depVersions!.push(source.version);

  let subs = source.subs;
  if (subs === null) {
    source.subs = subs = [];
  }
  subs.push(collector);
}
