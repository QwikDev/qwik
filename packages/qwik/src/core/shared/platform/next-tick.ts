/**
 * Creates a function that schedules `fn` to run as a microtask. Microtasks run before browser
 * paint, preventing flickering.
 */
export const createMicroTask = (fn: () => void) => {
  return () => queueMicrotask(fn);
};

export interface MacroTask {
  (): void;
  $destroy$?: () => void;
}

/**
 * Creates a function that schedules `fn` to run as a macrotask. Macrotasks yield to the browser,
 * allowing paint and user input. Used for time-slicing to avoid blocking the main thread.
 */
export const createMacroTask = (fn: () => void): MacroTask => {
  let macroTask: MacroTask;
  if (typeof MessageChannel !== 'undefined') {
    const channel = new MessageChannel();
    let active = true;
    channel.port1.onmessage = () => fn();
    macroTask = () => {
      if (active) {
        channel.port2.postMessage(null);
      }
    };
    macroTask.$destroy$ = () => {
      active = false;
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
    };
  } else {
    macroTask = () => setTimeout(fn);
  }
  return macroTask;
};

const YIELD_INTERVAL = 1000 / 60;

export interface YieldingIteratorState<T = void> {
  $iterator$: Generator<void, T, void>;
  $schedule$: () => void;
  $scheduled$: boolean;
}

export const scheduleYieldingIterator = <T>(state: YieldingIteratorState<T>): void => {
  if (!state.$scheduled$) {
    state.$scheduled$ = true;
    state.$schedule$();
  }
};

export const runYieldingIterator = <T>(
  state: YieldingIteratorState<T>,
  isActive: () => boolean,
  onDone: (value: T) => void,
  onError: (error: unknown) => void,
  yieldInterval: number = YIELD_INTERVAL,
  rethrowError = true
): void => {
  if (!isActive()) {
    return;
  }
  state.$scheduled$ = false;
  const deadline = performance.now() + yieldInterval;
  let count = 0;
  try {
    while (true) {
      const result = state.$iterator$.next();
      if (result.done) {
        onDone(result.value);
        return;
      }
      // Sampling the clock every 32 steps keeps `performance.now()` out of the hottest path.
      if ((++count & 31) === 0 && performance.now() >= deadline) {
        scheduleYieldingIterator(state);
        return;
      }
    }
  } catch (error) {
    onError(error);
    if (rethrowError) {
      throw error;
    }
  }
};
