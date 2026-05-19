import { createMacroTask } from '../shared/platform/next-tick';

export const YIELD_INTERVAL = 10;

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

const runYieldingIterator = <T>(
  state: YieldingIteratorState<T>,
  onDone: (value: T) => void,
  onError: (error: unknown) => void
): void => {
  state.$scheduled$ = false;
  const deadline = performance.now() + YIELD_INTERVAL;
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
  }
};

export const createYieldingIteratorState = <T>(
  iterator: Generator<void, T, void>,
  onDone: (value: T) => void,
  onError: (error: unknown) => void
) => {
  const state: YieldingIteratorState<T> = {
    $iterator$: iterator,
    $schedule$: undefined!,
    $scheduled$: false,
  };
  const schedule = createMacroTask(() => {
    runYieldingIterator(
      state,
      (value) => {
        schedule.$destroy$?.();
        onDone(value);
      },
      (error) => {
        schedule.$destroy$?.();
        onError(error);
      }
    );
  });
  state.$schedule$ = schedule;
  return state;
};
