import type { Source } from './source';
import type { CollectorSubscriber } from '../runtime/subscriber';

let activeCollector: CollectorSubscriber | null = null;

export function getActiveCollector(): CollectorSubscriber | null {
  return activeCollector;
}

// A collector is the subscriber currently reading sources. Reads inside this
// frame create dependency edges (source -> collector), but they do not imply
// lifetime ownership of subscribers created during the frame.
export function runWithCollector<T, TArgs extends unknown[]>(
  collector: CollectorSubscriber | null,
  run: (...args: TArgs) => T,
  ...args: TArgs
): T {
  const previous = activeCollector;
  activeCollector = collector;

  try {
    return run.apply(undefined, args);
  } finally {
    activeCollector = previous;
  }
}

export function untrack<T, TArgs extends unknown[]>(run: (...args: TArgs) => T, ...args: TArgs): T {
  return runWithCollector(null, run, ...args);
}

export function track(source: Source): void {
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

export function addDependency(collector: CollectorSubscriber, source: Source): void {
  collector.deps!.push(source);
  collector.depVersions!.push(source.version);

  let subs = source.subs;
  if (subs === null) {
    source.subs = subs = [];
  }
  subs.push(collector);
}
