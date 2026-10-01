import { appendSourceSubscriber, type Source } from './source';
import type { CollectorSubscriber } from '../runtime/subscriber';
import { getActiveInvokeContextOrNull, setActiveInvokeContext } from '../runtime/invoke-context';
import { isSubscriberDisposed } from '../runtime/subscriber';
import { registerSingleton } from '../shared/singletons';

const trackingState = /*#__PURE__*/ registerSingleton('v3.tracking', () => ({
  current: null as CollectorSubscriber | null,
}));

export function getActiveCollector(): CollectorSubscriber | null {
  return trackingState.current;
}

export function _await<T>(value: T | PromiseLike<T>): Promise<() => Awaited<T>> {
  const collector = trackingState.current;
  const invokeContext = getActiveInvokeContextOrNull();

  const resume = (value: unknown, rejected: boolean) => () => {
    const restored = collector !== null && isSubscriberDisposed(collector) ? null : collector;
    trackingState.current = restored;
    setActiveInvokeContext(invokeContext);

    // Keep tracking active through the current await continuation, then release the global state.
    queueMicrotask(() => {
      if (trackingState.current === restored) {
        trackingState.current = null;
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
  const previous = trackingState.current;
  trackingState.current = collector;

  try {
    return run.apply(undefined, args);
  } finally {
    trackingState.current = previous;
  }
}

export function runWithCollector0<T>(collector: CollectorSubscriber | null, run: () => T): T {
  const previous = trackingState.current;
  trackingState.current = collector;

  try {
    return run();
  } finally {
    trackingState.current = previous;
  }
}

export function runWithCollector1<T, TArg>(
  collector: CollectorSubscriber | null,
  run: (arg: TArg) => T,
  arg: TArg
): T {
  const previous = trackingState.current;
  trackingState.current = collector;

  try {
    return run(arg);
  } finally {
    trackingState.current = previous;
  }
}

/** @public */
export function untrack<T, TArgs extends unknown[]>(run: (...args: TArgs) => T, ...args: TArgs): T {
  return runWithCollector(null, run, ...args);
}

export function track(source: Source): void {
  const collector = trackingState.current;
  if (collector === null || collector === source) {
    return;
  }

  const deps = collector.deps;
  if (deps === null) {
    collector.deps = [source];
    appendSourceSubscriber(source, collector);
    return;
  }

  for (let i = 0; i < deps.length; i++) {
    if (deps[i] === source) {
      return;
    }
  }

  addDependency(collector, source);
}

export function addDependency(collector: CollectorSubscriber, source: Source): void {
  const deps = collector.deps!;
  if (deps.length === 0) {
    collector.deps = [source];
  } else if (deps.length === 1) {
    collector.deps = [deps[0], source];
  } else {
    deps.push(source);
  }
  appendSourceSubscriber(source, collector);
}
