import { appendSourceSubscriber, type Source } from './source';
import type { CollectorSubscriber } from '../runtime/subscriber';
import {
  getActiveInvokeContextOrNull,
  setActiveInvokeContext,
  type RuntimeInvokeContext,
} from '../runtime/invoke-context';

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

export function runWithCollector0<T>(collector: CollectorSubscriber | null, run: () => T): T {
  const previous = activeCollector;
  activeCollector = collector;

  try {
    return run();
  } finally {
    activeCollector = previous;
  }
}

export function runWithCollector1<T, TArg>(
  collector: CollectorSubscriber | null,
  run: (arg: TArg) => T,
  arg: TArg
): T {
  const previous = activeCollector;
  activeCollector = collector;

  try {
    return run(arg);
  } finally {
    activeCollector = previous;
  }
}

export function invokeWithCollector4<T, TFirst, TSecond, TThird, TFourth>(
  collector: CollectorSubscriber | null,
  context: RuntimeInvokeContext | null,
  run: (first: TFirst, second: TSecond, third: TThird, fourth: TFourth) => T,
  first: TFirst,
  second: TSecond,
  third: TThird,
  fourth: TFourth
): T {
  const previousCollector = activeCollector;
  const previousContext = getActiveInvokeContextOrNull();
  activeCollector = collector;
  setActiveInvokeContext(context);

  try {
    return run(first, second, third, fourth);
  } finally {
    setActiveInvokeContext(previousContext);
    activeCollector = previousCollector;
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
  appendSourceSubscriber(source, collector);
}
