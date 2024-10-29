import { isServerPlatform } from '../shared/platform/platform';
import { assertQrl } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { ChoreType } from '../shared/scheduler';
import { useSequentialScope } from './use-sequential-scope';
import { Task, TaskFlags, useRunTask, type TaskFn } from './use-task';

/** @public */
export type VisibleTaskStrategy = 'intersection-observer' | 'document-ready' | 'document-idle';

/** @public */
export interface OnVisibleTaskOptions {
  /**
   * The strategy to use to determine when the "VisibleTask" should first execute.
   *
   * - `intersection-observer`: the task will first execute when the element is visible in the
   *   viewport, under the hood it uses the IntersectionObserver API.
   * - `document-ready`: the task will first execute when the document is ready, under the hood it
   *   uses the document `load` event.
   * - `document-idle`: the task will first execute when the document is idle, under the hood it uses
   *   the requestIdleCallback API.
   */
  strategy?: VisibleTaskStrategy;
}

/** @internal */
export const useVisibleTaskQrl = (qrl: QRL<TaskFn>, opts?: OnVisibleTaskOptions): void => {
  const { val, set, i, iCtx } = useSequentialScope<Task<TaskFn>>();
  const eagerness = opts?.strategy ?? 'intersection-observer';
  if (val) {
    if (isServerPlatform()) {
      useRunTask(val, eagerness);
    }
    return;
  }
  assertQrl(qrl);

  const task = new Task(TaskFlags.VISIBLE_TASK, i, iCtx.$hostElement$, qrl, undefined, null);
  set(task);
  useRunTask(task, eagerness);
  if (!isServerPlatform()) {
    qrl.$resolveLazy$(iCtx.$element$);
    iCtx.$container$.$scheduler$(ChoreType.VISIBLE, task);
  }
};
