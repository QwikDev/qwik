/**
 * Scheduler is responsible for running application code in predictable order.
 *
 * ## What is a Chore?
 *
 * A Chore is a unit of work that needs to be done. It can be:
 *
 * - Task / Resource
 * - Visible Task
 * - Component
 * - Computed
 * - Node Diff
 *
 * ## Order of execution
 *
 * - Parent component chores should run before child component chores.
 * - Visible Tasks should run after journal flush (visible tasks often read DOM layout.)
 *
 * ## Example
 *
 * ```typescript
 * const Child = component$(() => {
 *   useTask$(() => {
 *     console.log('Child task');
 *   });
 *   useVisibleTask$(() => {
 *     console.log('Child visible-task');
 *   });
 *   console.log('Child render');
 *   return <div>Child</div>;
 * });
 *
 * const Parent = component$(() => {
 *   const count = useSignal(0);
 *   useTask$(() => {
 *     console.log('Parent task', count.value);
 *   });
 *   useVisibleTask$(() => {
 *     console.log('Parent visible-task', count.value);
 *     count.value++;
 *   });
 *   console.log('Parent render', count.value);
 *   return <Child/>;
 * });
 * ```
 *
 * ## In the above example, the order of execution is:
 *
 * 1. Parent task 0
 * 2. Parent render 0
 * 3. Child task 0
 * 4. Child render 0
 * 5. Journal flush
 * 6. Parent visible-task 0
 * 7. Parent render 1
 * 8. Journal flush
 * 9. Child visible-task
 *
 * If at any point a new chore is scheduled it will insert itself into the correct order.
 *
 * ## Implementation
 *
 * Chores are kept in a sorted array. When a new chore is scheduled it is inserted into the correct
 * location. Processing of the chores always starts from the beginning of the array. This ensures
 * that parent chores are processed before child chores.
 *
 * ## Sorting
 *
 * Chores are sorted in three levels:
 *
 * - Macro: beforeJournalFlush, journalFlush, afterJournalFlush
 * - Component: depth first order of components
 * - Micro: order of chores within a component.
 *
 * Example of sorting:
 *
 * - Tasks are beforeJournalFlush, than depth first on component and finally in declaration order
 *   within component.
 * - Visible Tasks are sorted afterJournalFlush, than depth first on component and finally in
 *   declaration order within component.
 */

import { componentQrl, type OnRenderFn } from '../../component/component.public';
import type { QRLInternal } from '../../qrl/qrl-class';
import type { QRL } from '../../qrl/qrl.public';
import type { JSXOutput } from '../../render/jsx/types/jsx-node';
import {
  Task,
  TaskFlagsIsDirty,
  TaskFlagsIsVisibleTask,
  runComputed2,
  runSubscriber2,
  type TaskFn,
  type useTaskQrl,
} from '../../use/use-task';
import { maybeThen, maybeThenPassError, safeCall } from '../../util/promises';
import type { ValueOrPromise } from '../../util/types';
import type { VirtualVNode } from '../client/types';
import { vnode_documentPosition, vnode_isChildOf, vnode_isVNode } from '../client/vnode';
import { vnode_diff } from '../client/vnode-diff';
import { JSX_LOCAL, executeComponent2 } from './component-execution';
import type { Container2, HostElement, fixMeAny } from './types';

// eslint-disable-next-line no-console
const DEBUG: false | ((...args: any[]) => void) = false; // (...args: any) => console.log(...args);

export const enum ChoreType {
  /// MASKS defining three levels of sorting
  MACRO /* ********* */ = 0xf0,
  MICRO /* ********* */ = 0x0f,

  COMPUTED /* ****** */ = 0x11,
  RESOURCE /* ****** */ = 0x12,
  TASK /* ********** */ = 0x13,
  NODE_DIFF /* ***** */ = 0x14,
  COMPONENT /* ***** */ = 0x15,
  JOURNAL_FLUSH /* * */ = 0x20,
  VISIBLE /* ******* */ = 0x30,
  CLEANUP /* ******* */ = 0x90,
}

export interface Chore {
  $type$: ChoreType;
  $idx$: number | string;
  $host$: HostElement;
  $target$: HostElement | QRLInternal<(...args: unknown[]) => unknown> | null;
  $payload$: unknown;
}

export type Scheduler = ReturnType<typeof createScheduler>;

export const createScheduler = (
  container: Container2,
  scheduleDrain: () => void,
  journalFlush: () => void
) => {
  const choreQueue: Chore[] = [];
  const hostElementCleanupQueue: HostElement[] = [];
  let drainResolve: ((value: void) => void) | null = null;

  const api = {
    $scheduleTask$: scheduleTask,
    $scheduleComputed$: scheduleComputed,
    $scheduleNodeDiff$: scheduleNodeDiff,
    $scheduleCleanup$: scheduleCleanup,
    $scheduleComponent$: scheduleComponent,
    $schedule$: schedule,
    $drainAll$: drainAll,
    $drainCleanup$: drainCleanup,
    $drainComponent$: drainComponent,
    $empty$: Promise.resolve(),
  };
  return api;

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////

  function scheduleTask(task: Task) {
    // console.log('scheduleTask', task.$qrl$.$symbol$, task.$flags$ & TaskFlagsIsDirty);
    task.$flags$ |= TaskFlagsIsDirty;
    schedule(
      task.$flags$ & TaskFlagsIsVisibleTask ? ChoreType.VISIBLE : ChoreType.TASK,
      task.$el$ as fixMeAny,
      task.$qrl$ as fixMeAny,
      task.$index$,
      task
    );
    return api;
  }

  function scheduleComputed(task: Task) {
    schedule(ChoreType.COMPUTED, task.$el$ as fixMeAny, task.$qrl$ as fixMeAny, task.$index$, task);
    return api;
  }

  function scheduleNodeDiff(element: HostElement, target: HostElement, value: JSXOutput) {
    schedule(ChoreType.NODE_DIFF, element as fixMeAny, target, 0, value);
    return api;
  }

  function scheduleCleanup(task: Task) {
    schedule(ChoreType.CLEANUP, task.$el$ as fixMeAny, task.$qrl$ as fixMeAny, task.$index$, task);
    return api;
  }

  function scheduleComponent(
    hostElement: HostElement,
    componentQrl: QRL<OnRenderFn<any>>,
    props: any
  ) {
    schedule(ChoreType.COMPONENT, hostElement, componentQrl, Number.MAX_SAFE_INTEGER, props);
    return api;
  }

  function schedule(type: ChoreType.JOURNAL_FLUSH): void;
  function schedule(
    type: ChoreType.TASK | ChoreType.VISIBLE,
    host: HostElement,
    qrl: Parameters<typeof useTaskQrl>[0],
    idx: number,
    task: Task
  ): void;
  function schedule(
    type: ChoreType.NODE_DIFF,
    host: HostElement,
    target: HostElement,
    idx: 0,
    value: any
  ): void;
  function schedule(
    type: ChoreType.CLEANUP,
    host: HostElement,
    qrl: Parameters<typeof useTaskQrl>[0],
    idx: number,
    task: Task
  ): void;
  function schedule(
    type: ChoreType.COMPONENT,
    host: HostElement,
    qrl: Parameters<typeof componentQrl>[0],
    idx: number,
    props: any
  ): void;
  function schedule(
    type: ChoreType.COMPUTED,
    host: HostElement,
    qrl: QRL<OnRenderFn<any>>,
    idx: number,
    task: Task
  ): void;
  function schedule(
    type: ChoreType,
    host: HostElement = null!,
    target: HostElement | QRL<(...args: any[]) => any> | null = null,
    idx: number | string = 0,
    payload: unknown = null
  ) {
    const chore: Chore = {
      $type$: type,
      $idx$: idx,
      $host$: host,
      $target$: target as any,
      $payload$: payload,
    };
    if (type == ChoreType.CLEANUP) {
      let hostChoreQueue = container.getHostProp<Chore[]>(host, CLEANUP_LOCAL);
      if (!hostChoreQueue) {
        container.setHostProp(host, CLEANUP_LOCAL, (hostChoreQueue = []));
      }
      sortedInsert(hostChoreQueue, chore, intraHostPredicate, choreUpdate);
      sortedInsert(hostElementCleanupQueue, host, hostElementPredicate);
    } else {
      sortedInsert(choreQueue, chore, schedulePredicate, choreUpdate);
    }
    DEBUG &&
      DEBUG('scheduler.schedule', debugChoreToString(chore), choreQueue.map(debugChoreToString));
    if (!drainResolve) {
      DEBUG && DEBUG('scheduler.scheduleDrain()');
      scheduleDrain();
    }
  }

  function drainAll(uptoComponent?: HostElement): ValueOrPromise<void> {
    DEBUG &&
      DEBUG(
        'scheduler.drainAll',
        String(uptoComponent).replaceAll(/\n.*/gim, ''),
        choreQueue.map(debugChoreToString)
      );
    if (!drainResolve) {
      api.$empty$ = new Promise<void>((resolve) => (drainResolve = resolve));
    }
    while (choreQueue.length) {
      if (uptoComponent && !isComponentInQueue(uptoComponent)) {
        break;
      }
      const chore = choreQueue.shift()!;
      return maybeThenPassError(executeChore(chore), () => drainAll(uptoComponent));
    }
    const resolve = drainResolve!;
    drainResolve = null;
    DEBUG && DEBUG('scheduler.drainAll.DONE', choreQueue.map(debugChoreToString));
    resolve && resolve();
  }

  function isComponentInQueue(host: HostElement): boolean {
    for (let i = 0; i < choreQueue.length; i++) {
      const chore = choreQueue[i];
      if (chore.$host$ === host) {
        return true;
      }
    }
    return false;
  }

  function drainComponent(host: HostElement): ValueOrPromise<JSXOutput> {
    return maybeThenPassError(drainAll(host), () =>
      container.getHostProp<JSXOutput>(host, JSX_LOCAL)
    )!;
  }

  function drainCleanup(host: HostElement | null) {
    let idx = host ? sortedFindIndex(hostElementCleanupQueue, host, hostElementPredicate) : 0;
    if (idx < 0) {
      idx = ~idx;
    }

    while (hostElementCleanupQueue.length > idx) {
      const hostElement = hostElementCleanupQueue[idx];
      if (host === null || vnode_isChildOf(host as fixMeAny, hostElement as fixMeAny)) {
        hostElementCleanupQueue.splice(idx, idx + 1);
        const hostChores = container.getHostProp<Chore[]>(hostElement, CLEANUP_LOCAL);
        hostChores && hostChores.forEach(executeChore);
      }
    }
  }

  function executeChore(chore: Chore) {
    const host = chore.$host$;
    DEBUG && DEBUG('scheduler.EXECUTE', debugChoreToString(chore));
    switch (chore.$type$) {
      case ChoreType.JOURNAL_FLUSH:
        return journalFlush();
      case ChoreType.COMPONENT:
        return safeCall(
          () =>
            executeComponent2(
              container,
              host,
              host,
              chore.$target$ as fixMeAny,
              chore.$payload$ as fixMeAny
            ),
          (jsx) =>
            maybeThen(container.processJsx(host, jsx), () => schedule(ChoreType.JOURNAL_FLUSH)),
          (err: any) => container.handleError(err, host)
        );
      case ChoreType.COMPUTED:
        return runComputed2(chore.$payload$ as Task<TaskFn, TaskFn>, container, host);
      case ChoreType.TASK:
      case ChoreType.VISIBLE:
        return runSubscriber2(chore.$payload$ as Task<TaskFn, TaskFn>, container, host);
      case ChoreType.NODE_DIFF: {
        const parentVirtualNode = chore.$target$ as VirtualVNode;
        const jsx = chore.$payload$ as JSXOutput;
        return maybeThen(vnode_diff(container as fixMeAny, jsx, parentVirtualNode), () => {
          schedule(ChoreType.JOURNAL_FLUSH);
        });
      }
      case ChoreType.CLEANUP: {
        const task = chore.$payload$ as Task<TaskFn, TaskFn>;
        task.$destroy$ && task.$destroy$();
        break;
      }
    }
  }
};

export const hostElementPredicate = (aHost: HostElement, bHost: HostElement): number => {
  if (aHost === bHost) {
    return 0;
  } else {
    if (vnode_isVNode(aHost) && vnode_isVNode(bHost)) {
      // we are running on the client.
      return vnode_documentPosition(aHost, bHost);
    } else {
      // we are running on the server.
      // On server we can't schedule task for a different host!
      // Server is SSR, and therefore scheduling for anything but the current host
      // implies that things need to be re-run nad that is not supported because of streaming.
      throw new Error(
        'SERVER: during HTML streaming, it is not possible to cause a re-run of tasks on a different host'
      );
    }
  }
};

const toNumber = (value: number | string): number => {
  return typeof value === 'number' ? value : -1;
};

/**
 * When a derived signal is update we need to run vnode_diff. However the signal can update multiple
 * times during component execution. For this reason it is necessary for us to update the schedule
 * work with the latest result of the signal.
 */
const choreUpdate = (existing: Chore, newChore: Chore): void => {
  if (existing.$type$ === ChoreType.NODE_DIFF) {
    existing.$payload$ = newChore.$payload$;
  }
};

export const schedulePredicate = (a: Chore, b: Chore): number => {
  const macroTypeDiff = (a.$type$ & ChoreType.MACRO) - (b.$type$ & ChoreType.MACRO);
  if (macroTypeDiff !== 0) {
    return macroTypeDiff;
  }

  // JOURNAL_FLUSH does not have a host or $idx$, so we can't compare it.
  if (a.$type$ !== ChoreType.JOURNAL_FLUSH) {
    const aHost = a.$host$;
    const bHost = b.$host$;
    if (aHost !== bHost) {
      if (vnode_isVNode(aHost) && vnode_isVNode(bHost)) {
        // we are running on the client.
        const hostDiff = vnode_documentPosition(aHost, bHost);
        if (hostDiff !== 0) {
          if (vnode_documentPosition(bHost, aHost) !== -hostDiff) {
            debugger;
          }
          return hostDiff;
        }
      } else {
        // we are running on the server.
        // On server we can't schedule task for a different host!
        // Server is SSR, and therefore scheduling for anything but the current host
        // implies that things need to be re-run nad that is not supported because of streaming.
        throw new Error(
          'SERVER: during HTML streaming, it is not possible to cause a re-run of tasks on a different host'
        );
      }
    }

    const microTypeDiff = (a.$type$ & ChoreType.MICRO) - (b.$type$ & ChoreType.MICRO);
    if (microTypeDiff !== 0) {
      return microTypeDiff;
    }

    const idxDiff = toNumber(a.$idx$) - toNumber(b.$idx$);
    if (idxDiff !== 0) {
      return idxDiff;
    }
  }

  return 0;
};

export const intraHostPredicate = (a: Chore, b: Chore): number => {
  const idxDiff = toNumber(a.$idx$) - toNumber(b.$idx$);
  if (idxDiff !== 0) {
    return idxDiff;
  }
  const typeDiff = a.$type$ - b.$type$;
  if (typeDiff !== 0) {
    return typeDiff;
  }
  if (a.$payload$ !== b.$payload$) {
    return 0;
  }
  if (a.$payload$ instanceof Task && b.$payload$ instanceof Task) {
    const aHash = a.$payload$.$qrl$.$hash$;
    const bHash = b.$payload$.$qrl$.$hash$;
    return aHash === bHash ? 0 : aHash < bHash ? -1 : 1;
  }
  return 0;
};

const CLEANUP_LOCAL = ':cleanup';
function sortedFindIndex<T>(
  sortedArray: T[],
  value: T,
  comparator: (a: T, b: T) => number
): number {
  /// We need to ensure that the `queue` is sorted by priority.
  /// 1. Find a place where to insert into.
  let bottom = 0;
  let top = sortedArray.length;
  while (bottom < top) {
    const middle = bottom + ((top - bottom) >> 1);
    const midChore = sortedArray[middle];
    const comp = comparator(value, midChore);
    if (comp < 0) {
      top = middle;
    } else if (comp > 0) {
      bottom = middle + 1;
    } else {
      // We already have the host in the queue.
      return middle;
    }
  }
  return ~bottom;
}

function sortedInsert<T>(
  sortedArray: T[],
  value: T,
  comparator: (a: T, b: T) => number,
  updater?: (a: T, b: T) => void
) {
  /// We need to ensure that the `queue` is sorted by priority.
  /// 1. Find a place where to insert into.
  const idx = sortedFindIndex(sortedArray, value, comparator);
  if (idx < 0) {
    /// 2. Insert the chore into the queue.
    sortedArray.splice(~idx, 0, value);
  } else if (updater) {
    updater(sortedArray[idx], value);
  }
}

function debugChoreToString(chore: Chore): string {
  const type = (
    {
      [ChoreType.COMPUTED]: 'COMPUTED',
      [ChoreType.RESOURCE]: 'RESOURCE',
      [ChoreType.TASK]: 'TASK',
      [ChoreType.NODE_DIFF]: 'NODE_DIFF',
      [ChoreType.COMPONENT]: 'COMPONENT',
      [ChoreType.JOURNAL_FLUSH]: 'JOURNAL_FLUSH',
      [ChoreType.VISIBLE]: 'VISIBLE',
      [ChoreType.CLEANUP]: 'CLEANUP',
    } as any
  )[chore.$type$];
  const host = String(chore.$host$).replaceAll(/\n.*/gim, '');
  return `Chore(${type} ${host} ${chore.$idx$})`;
}
