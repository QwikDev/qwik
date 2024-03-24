import { componentQrl, type OnRenderFn } from '../../component/component.public';
import type { QRLInternal } from '../../qrl/qrl-class';
import type { QRL } from '../../qrl/qrl.public';
import type { JSXOutput } from '../../render/jsx/types/jsx-node';
import {
  runComputed2,
  runSubscriber2,
  Task,
  TaskFlagsIsDirty,
  type TaskFn,
  type useTaskQrl,
  type useVisibleTaskQrl,
} from '../../use/use-task';
import { EMPTY_ARRAY } from '../../util/flyweight';
import { isPromise, maybeThen, shouldNotError } from '../../util/promises';
import type { ValueOrPromise } from '../../util/types';
import type { VirtualVNode } from '../client/types';
import { vnode_documentPosition, vnode_isChildOf, vnode_isVNode } from '../client/vnode';
import { vnode_diff } from '../client/vnode-diff';
import { executeComponent2, JSX_LOCAL } from './component-execution';
import type { Container2, fixMeAny, HostElement } from './types';

export const enum ChoreType {
  COMPUTED = 0,
  CLEANUP = 1,
  RESOURCE = 2,
  TASK = 3,
  NODE_DIFF = 4,
  // TODO: not needed, updating prop does not require scheduler
  // NODE_PROP = 5,
  COMPONENT = 6,
  VISIBLE = 7,
  SIMPLE = 8,
}
// const TYPE2EVENT: Array<
//   typeof TaskEvent | typeof ComputedEvent | typeof ResourceEvent | typeof RenderEvent
// > = [
//   TaskEvent, ////// 0 - ChoreType.TASK
//   ComputedEvent, // 1 - ChoreType.COMPUTED
//   ResourceEvent, // 2 - ChoreType.RESOURCE
//   RenderEvent, //// 3 - ChoreType.COMPONENT
//   TaskEvent, ////// 4 - ChoreType.VISIBLE
// ];

export interface Chore {
  $type$: ChoreType;
  $idx$: number | string;
  $target$: HostElement | QRLInternal<(...args: unknown[]) => unknown> | null;
  $payload$: unknown;
}

export type Scheduler = ReturnType<typeof createScheduler>;

export const createScheduler = (container: Container2, scheduleDrain: () => void) => {
  const hostElementQueue: HostElement[] = [];
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
    schedule(ChoreType.TASK, task.$el$ as fixMeAny, task.$qrl$ as fixMeAny, task.$index$, task);
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

  function schedule(
    type: ChoreType.TASK,
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
    type: ChoreType.VISIBLE,
    host: HostElement,
    qrl: Parameters<typeof useVisibleTaskQrl>[0],
    idx: number
  ): void;
  function schedule(
    type: ChoreType.SIMPLE,
    host: HostElement,
    qrl: Parameters<typeof useVisibleTaskQrl>[0]
  ): void;
  function schedule(
    type: ChoreType,
    host: HostElement,
    target: HostElement | QRL<(...args: any[]) => any> | null,
    idx: number | string = 0,
    payload: unknown = null
  ) {
    // console.log('>>>> SCHEDULE', !drainResolve, String(host));
    const localQueueName = type == ChoreType.CLEANUP ? CLEANUP_LOCAL : CHORES_LOCAL;
    let hostChoreQueue = container.getHostProp<Chore[]>(host, localQueueName);
    if (!hostChoreQueue) {
      container.setHostProp(host, localQueueName, (hostChoreQueue = []));
    }
    sortedInsert(
      hostChoreQueue,
      { $type$: type, $idx$: idx, $target$: target as any, $payload$: payload },
      intraHostPredicate
    );
    sortedInsert(
      type == ChoreType.CLEANUP ? hostElementCleanupQueue : hostElementQueue,
      host,
      hostElementPredicate
    );
    if (!drainResolve) {
      scheduleDrain();
    }
  }

  function drainAll(): ValueOrPromise<void> {
    // console.log('>>>> drainAll', hostElementQueue.length, hostElementCleanupQueue.length);
    if (!drainResolve) {
      api.$empty$ = new Promise<void>((resolve) => (drainResolve = resolve));
    }
    while (hostElementQueue.length) {
      const hostElement = hostElementQueue.shift()!;
      const jsx = drainComponent(hostElement);
      if (isPromise(jsx)) {
        return jsx.then((jsx) => {
          if (jsx !== null) {
            return maybeThen(container.processJsx(hostElement, jsx), drainAll);
          } else {
            drainAll();
          }
        }, shouldNotError);
      }
      if (jsx !== null) {
        const shouldWait = container.processJsx(hostElement, jsx);
        if (isPromise(shouldWait)) {
          return shouldWait.then(drainAll);
        }
      }
    }
    const resolve = drainResolve!;
    drainResolve = null;
    // console.log('<<<< drainAll done');
    resolve && resolve();
  }

  function drainComponent(host: HostElement, hostChores?: Chore[]): ValueOrPromise<JSXOutput> {
    if (!hostChores) {
      hostChores = container.getHostProp<Chore[]>(host, CHORES_LOCAL) || EMPTY_ARRAY;
    }
    // console.log('drainComponent', hostChores.length, hostChores[0]?.$type$);
    while (hostChores.length) {
      const chore = hostChores.shift()!;
      const handleError = (err: any) => container.handleError(err, host);
      try {
        const result = executeChore(host, chore);
        if (isPromise(result)) {
          return result.then(
            () => drainComponent(host, hostChores),
            handleError
          ) as ValueOrPromise<JSXOutput>;
        }
      } catch (err) {
        handleError(err);
      }
    }
    sortedRemove(hostElementQueue, host, hostElementPredicate);
    return container.getHostProp<JSXOutput>(host, JSX_LOCAL)!;
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
        hostChores && hostChores.forEach((chore) => executeChore(hostElement, chore));
      }
    }
  }

  function executeChore(host: HostElement, chore: Chore) {
    switch (chore.$type$) {
      case ChoreType.COMPONENT:
        return executeComponent2(
          container,
          host,
          host,
          chore.$target$ as fixMeAny,
          chore.$payload$ as fixMeAny
        );
      case ChoreType.COMPUTED:
        return runComputed2(chore.$payload$ as Task<TaskFn, TaskFn>, container, host);
      case ChoreType.TASK:
        return runSubscriber2(chore.$payload$ as Task<TaskFn, TaskFn>, container, host);
      case ChoreType.NODE_DIFF: {
        const parentVirtualNode = chore.$target$ as VirtualVNode;
        const jsx = chore.$payload$ as JSXOutput;
        return vnode_diff(container as fixMeAny, jsx, parentVirtualNode);
      }
      case ChoreType.CLEANUP: {
        const task = chore.$payload$ as Task<TaskFn, TaskFn>;
        task.$destroy$ && task.$destroy$();
        break;
      }
      case ChoreType.SIMPLE:
        return (chore.$target$ as QRLInternal<(...args: unknown[]) => unknown>).getFn()();
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

export const intraHostPredicate = (a: Chore, b: Chore): number => {
  const idxDiff = toNumber(a.$idx$) - toNumber(b.$idx$);
  if (idxDiff !== 0) {
    return idxDiff;
  }
  const typeDiff = a.$type$ - b.$type$;
  if (typeDiff !== 0) {
    return typeDiff;
  }
  return 0;
};

const CHORES_LOCAL = ':chores';
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
    const comp = comparator(midChore, value);
    if (comp < 0) {
      bottom = middle + 1;
    } else if (comp > 0) {
      top = middle - 1;
    } else {
      // We already have the host in the queue.
      return middle;
    }
  }
  return ~bottom;
}
function sortedInsert<T>(sortedArray: T[], value: T, comparator: (a: T, b: T) => number) {
  /// We need to ensure that the `queue` is sorted by priority.
  /// 1. Find a place where to insert into.
  const idx = sortedFindIndex(sortedArray, value, comparator);
  if (idx < 0) {
    /// 2. Insert the chore into the queue.
    sortedArray.splice(~idx, 0, value);
  }
}

function sortedRemove<T>(sortedArray: T[], value: T, comparator: (a: T, b: T) => number) {
  const idx = sortedFindIndex(sortedArray, value, comparator);
  if (idx >= 0) {
    sortedArray.splice(idx, 1);
  }
}
