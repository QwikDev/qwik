import { AsyncComputedSignalImpl } from '../../reactive-primitives/impl/async-computed-signal-impl';
import type { NoSerialize } from '../../shared/serdes/verify';
import { logError } from '../../shared/utils/log';
import { isTask } from '../use-task';

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

export const isDestroyable = (obj: unknown): obj is Destroyable => {
  return isTask(obj) || obj instanceof AsyncComputedSignalImpl;
};
