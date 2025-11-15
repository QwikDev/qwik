import type { NoSerialize } from '../../shared/serdes/verify';
import { logError } from '../../shared/utils/log';

export type Destroyable = { $destroy$: NoSerialize<() => void> | null };

export const cleanupDestroyable = (destroyable: Destroyable) => {
  const destroy = destroyable.$destroy$;
  if (destroy) {
    destroyable.$destroy$ = null;
    try {
      destroy();
    } catch (err) {
      logError(err);
    }
  }
};
