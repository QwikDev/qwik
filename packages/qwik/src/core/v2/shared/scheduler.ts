import type { componentQrl } from '../../component/component.public';
import type { QRLInternal } from '../../qrl/qrl-class';
import type { QRL } from '../../qrl/qrl.public';
import { handleError2 } from '../../render/error-handling';
import { newInvokeContext } from '../../use/use-core';
import {
  Task,
  runTask2,
  type TaskFn,
  type useComputedQrl,
  type useTaskQrl,
  type useVisibleTaskQrl,
} from '../../use/use-task';
import { ComputedEvent, RenderEvent, ResourceEvent, TaskEvent } from '../../util/markers';
import { isPromise, maybeThen } from '../../util/promises';
import type { ValueOrPromise } from '../../util/types';
import type { ClientContainer, VirtualVNode } from '../client/types';
import { vnode_documentPosition } from '../client/vnode';
import { vnode_applyJournal, vnode_diff } from '../client/vnode-diff';
import { executeComponent2 } from './component-execution';
import type { Container2, fixMeAny } from './types';

export const enum ChoreStage {
  PRE_RENDER = 0,
  RENDER = 1,
  POST_RENDER = 2,
}

export const enum ChoreType {
  TASK = 0,
  COMPUTED = 1,
  RESOURCE = 2,
  COMPONENT = 3,
  VISIBLE = 4,
  SIMPLE = 5,
}
const TYPE2EVENT: Array<
  typeof TaskEvent | typeof ComputedEvent | typeof ResourceEvent | typeof RenderEvent
> = [
  TaskEvent, ////// 0 - ChoreType.TASK
  ComputedEvent, // 1 - ChoreType.COMPUTED
  ResourceEvent, // 2 - ChoreType.RESOURCE
  RenderEvent, //// 3 - ChoreType.COMPONENT
  TaskEvent, ////// 4 - ChoreType.VISIBLE
];

export interface Chore {
  $stage$: ChoreStage;
  $host$: VirtualVNode;
  $type$: ChoreType;
  $idx$: number;
  $qrl$: QRLInternal<(...args: unknown[]) => unknown>;
  $payload$: unknown;
}

export const createScheduler = (
  container: ClientContainer,
  priorityPredicate = schedulePriorityPredicate
) => {
  const queue: Chore[] = [];
  let drainResolve: ((value: void) => void) | null = null;

  const api = {
    $schedule$: schedule,
    $drain$: drain,
    $empty$: Promise.resolve(),
  };
  return api;

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////

  function schedule(
    type: ChoreType.TASK,
    host: VirtualVNode,
    qrl: Parameters<typeof useTaskQrl>[0],
    idx: number,
    task: Task
  ): void;
  function schedule(
    type: ChoreType.COMPONENT,
    host: VirtualVNode,
    qrl: Parameters<typeof componentQrl>[0]
  ): void;
  function schedule(
    type: ChoreType.COMPUTED,
    host: VirtualVNode,
    qrl: Parameters<typeof useComputedQrl>[0],
    idx: number
  ): void;
  function schedule(
    type: ChoreType.VISIBLE,
    host: VirtualVNode,
    qrl: Parameters<typeof useVisibleTaskQrl>[0],
    idx: number
  ): void;
  function schedule(
    type: ChoreType.SIMPLE,
    host: VirtualVNode,
    qrl: Parameters<typeof useVisibleTaskQrl>[0]
  ): void;
  function schedule(
    type: ChoreType,
    host: VirtualVNode,
    qrl: QRL<(...args: any[]) => any>,
    idx: number = 0,
    payload: unknown = null
  ) {
    const chore: Chore = {
      $stage$: ChoreStage.PRE_RENDER,
      $host$: host,
      $type$: type,
      $idx$: idx,
      $qrl$: qrl as any,
      $payload$: payload,
    };
    /// We need to ensure that the `queue` is sorted by priority.
    /// 1. Find a placet where to insert into.
    let bottom = 0;
    let top = queue.length;
    while (bottom < top) {
      const middle = bottom + ((top - bottom) >> 1);
      const midChore = queue[middle];
      const comp = priorityPredicate(midChore, chore);
      if (comp < 0) {
        bottom = middle + 1;
      } else if (comp > 0) {
        top = middle - 1;
      } else {
        // We already have the same chore in the queue.
        return;
      }
    }
    /// 2. Insert the chore into the queue.
    queue.splice(bottom, 0, chore);
  }

  function drain(): ValueOrPromise<void> {
    if (!drainResolve) {
      api.$empty$ = new Promise<void>((resolve) => (drainResolve = resolve));
    }
    while (queue.length) {
      const chore = queue.shift()!;
      const handleError = (err: any) => handleError2(err, chore.$host$, container);
      try {
        let result: any;
        switch (chore.$type$) {
          case ChoreType.COMPONENT:
            result = executeComponent2(container, chore.$host$, chore.$qrl$ as fixMeAny, null);
            result = maybeThen(result, (result) => vnode_diff(container, result, chore.$host$));
            break;
          case ChoreType.TASK:
            result = runTask2(
              chore.$payload$ as any as Task<TaskFn, TaskFn>,
              container,
              chore.$host$
            );
            break;
          case ChoreType.SIMPLE:
            result = chore.$qrl$.getFn()();
            break;
        }
        if (isPromise(result)) {
          return result.then(drain, handleError);
        }
      } catch (err) {
        handleError(err);
      }
    }
    vnode_applyJournal(container.$journal$);
    const resolve = drainResolve!;
    drainResolve = null;
    resolve!();
  }
};

export const schedulePriorityPredicate = (a: Chore, b: Chore): number => {
  const stageDiff = a.$stage$ - b.$stage$;
  if (stageDiff !== 0) {
    return stageDiff;
  }
  const hostDiff = vnode_documentPosition(a.$host$, b.$host$);
  if (hostDiff !== 0) {
    return hostDiff;
  }
  const idxDiff = a.$idx$ - b.$idx$;
  if (idxDiff !== 0) {
    return idxDiff;
  }
  const typeDiff = a.$type$ - b.$type$;
  if (typeDiff !== 0) {
    return typeDiff;
  }
  return 0;
};
