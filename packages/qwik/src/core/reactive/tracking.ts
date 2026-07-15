import type { Source } from './source';
import type { CollectorSubscriber } from '../runtime/subscriber';
import { getActiveInvokeContextOrNull, setActiveInvokeContext } from '../runtime/invoke-context';

let activeCollector: CollectorSubscriber | null = null;

export function getActiveCollector(): CollectorSubscriber | null {
  return activeCollector;
}

export function _await<T>(value: T | PromiseLike<T>): Promise<() => Awaited<T>> {
  const collector = activeCollector;
  const invokeContext = getActiveInvokeContextOrNull();

  const resume = (value: unknown, rejected: boolean) => () => {
    const restored = collector?.owner === null ? null : collector;
    activeCollector = restored;
    setActiveInvokeContext(invokeContext);

    // Keep tracking active through the current await continuation, then release the global state.
    queueMicrotask(() => {
      if (activeCollector === restored) {
        activeCollector = null;
      }
      if (getActiveInvokeContextOrNull() === invokeContext) {
        setActiveInvokeContext(null);
      }
    });

    if (rejected) {
      throw value;
    }
    return value as Awaited<T>;
  };

  return Promise.resolve(value).then(
    (value) => resume(value, false),
    (error) => resume(error, true)
  );
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

/** @public */
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
