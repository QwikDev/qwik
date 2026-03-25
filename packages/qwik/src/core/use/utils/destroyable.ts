import { logError } from '../../shared/utils/log';
import { isPromise } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';

export type Destroyable = { $destroy$: (() => void) | null };
export type AsyncDestroyable = Destroyable & { $destroyPromise$: Promise<void> | null };

export const cleanupDestroyable = (destroyable: Destroyable) => {
  if (destroyable.$destroy$) {
    try {
      destroyable.$destroy$();
    } catch (err) {
      logError(err);
    }
    destroyable.$destroy$ = null;
  }
};

export const cleanupAsyncDestroyable = (
  destroyable: AsyncDestroyable,
  handleError: (reason: unknown) => void
): ValueOrPromise<void> => {
  const pendingCleanup = destroyable.$destroyPromise$;
  if (pendingCleanup) {
    return pendingCleanup;
  }

  const cleanup = destroyable.$destroy$;
  if (!cleanup) {
    return;
  }

  destroyable.$destroy$ = null;

  try {
    const result = cleanup();
    if (isPromise(result)) {
      const cleanupPromise: Promise<void> = Promise.resolve(result)
        .then(
          () => undefined,
          (err) => {
            handleError(err);
          }
        )
        .finally(() => {
          if (destroyable.$destroyPromise$ === cleanupPromise) {
            destroyable.$destroyPromise$ = null;
          }
        });
      destroyable.$destroyPromise$ = cleanupPromise;
      return cleanupPromise;
    }
  } catch (err) {
    handleError(err);
  }

  return;
};
