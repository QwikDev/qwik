import { createMacroTask } from '../shared/platform/next-tick';

const YIELD_INTERVAL = 10;

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

/** Runs the iterator until it finishes or the time slice runs out; `null` means unfinished. */
export const runIteratorSlice = <T>(
  iterator: Generator<void, T, void>
): IteratorReturnResult<T> | null => {
  const deadline = performance.now() + YIELD_INTERVAL;
  let count = 0;
  while (true) {
    const result = iterator.next();
    if (result.done) {
      return result;
    }
    // Sampling the clock every 32 steps keeps `performance.now()` out of the hottest path.
    if ((++count & 31) === 0 && performance.now() >= deadline) {
      return null;
    }
  }
};

const runYieldingIterator = <T>(
  state: YieldingIteratorState<T>,
  onDone: (value: T) => void,
  onError: (error: unknown) => void
): void => {
  state.$scheduled$ = false;
  try {
    const result = runIteratorSlice(state.$iterator$);
    if (result) {
      onDone(result.value);
    } else {
      scheduleYieldingIterator(state);
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
