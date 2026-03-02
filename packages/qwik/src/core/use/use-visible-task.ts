import type { EventHandler } from '../shared/jsx/types/jsx-qwik-attributes';
import { isServerPlatform } from '../shared/platform/platform';
import { createQRL, type QRLInternal } from '../shared/qrl/qrl-class';
import { assertQrl } from '../shared/qrl/qrl-utils';
import type { QRL } from '../shared/qrl/qrl.public';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { useOn, useOnDocument } from './use-on';
import { useSequentialScope } from './use-sequential-scope';
import { Task, TaskFlags, scheduleTask, type TaskFn } from './use-task';

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
    if (!(val.$flags$ & TaskFlags.EVENTS_REGISTERED) && !isServerPlatform()) {
      val.$flags$ |= TaskFlags.EVENTS_REGISTERED;
      useRegisterTaskEvents(val, eagerness);
    }
    return;
  }
  assertQrl(qrl);

  let flags: number;
  if (!isServerPlatform()) {
    // In DOM we immediately execute
    flags = TaskFlags.VISIBLE_TASK | TaskFlags.DIRTY;
    (qrl as QRLInternal).resolve();
    markVNodeDirty(iCtx.$container$, iCtx.$hostElement$, ChoreBits.TASKS);
  } else {
    // In SSR we defer execution until triggered in DOM
    flags = TaskFlags.VISIBLE_TASK;
  }

  const task = new Task(flags, i, iCtx.$hostElement$, qrl, undefined, null);
  set(task);
  useRegisterTaskEvents(task, eagerness);
};

export const useRegisterTaskEvents = (task: Task, eagerness: VisibleTaskStrategy | undefined) => {
  if (eagerness === 'intersection-observer') {
    useOn('qvisible', getTaskHandlerQrl(task));
  } else if (eagerness === 'document-ready') {
    useOnDocument('qinit', getTaskHandlerQrl(task));
  } else if (eagerness === 'document-idle') {
    useOnDocument('qidle', getTaskHandlerQrl(task));
  }
};

const getTaskHandlerQrl = (task: Task): QRL<EventHandler> => {
  return createQRL<EventHandler>(null, '_task', scheduleTask, null, [task]);
};
