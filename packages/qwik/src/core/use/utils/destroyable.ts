import { logError } from '../../shared/utils/log';

export type Destroyable = { $destroy$: (() => void) | null };

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
