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

import { assertEqual } from './error/assert';
import type { QRLInternal } from './qrl/qrl-class';
import type { QRL } from './qrl/qrl.public';
import type { JSXOutput } from './jsx/types/jsx-node';
import { Task, TaskFlags, cleanupTask, runTask, type TaskFn } from '../use/use-task';
import { runResource, type ResourceDescriptor } from '../use/use-resource';
import { logWarn, throwErrorAndStop } from './utils/log';
import { isPromise, maybeThen, maybeThenPassError, safeCall } from './utils/promises';
import type { ValueOrPromise } from './utils/types';
import { isDomContainer } from '../client/dom-container';
import {
  ElementVNodeProps,
  VNodeFlags,
  VNodeProps,
  type ElementVNode,
  type VirtualVNode,
} from '../client/types';
import {
  vnode_documentPosition,
  vnode_isVNode,
  vnode_setAttr,
  VNodeJournalOpCode,
} from '../client/vnode';
import { vnode_diff } from '../client/vnode-diff';
import { executeComponent } from './component-execution';
import type { Container, HostElement, fixMeAny } from './types';
import { isSignal, type Signal } from '../signal/signal.public';
import { type DomContainer } from '../client/dom-container';
import { serializeAttribute } from './utils/styles';

// Turn this on to get debug output of what the scheduler is doing.
const DEBUG: boolean = false;

export const enum ChoreType {
  /// MASKS defining three levels of sorting
  MACRO /* ***************** */ = 0b111_0000,
  /* order of elements (not encoded here) */
  MICRO /* ***************** */ = 0b000_1111,

  /** Ensure tha the QRL promise is resolved before processing next chores in the queue */
  QRL_RESOLVE /* *********** */ = 0b000_0001,
  RESOURCE /* ************** */ = 0b000_0010,
  TASK /* ****************** */ = 0b000_0011,
  NODE_DIFF /* ************* */ = 0b000_0100,
  NODE_PROP /* ************* */ = 0b000_0101,
  COMPONENT_SSR /* ********* */ = 0b000_0110,
  COMPONENT /* ************* */ = 0b000_0111,
  WAIT_FOR_COMPONENTS /* *** */ = 0b001_0000,
  JOURNAL_FLUSH /* ********* */ = 0b011_0000,
  VISIBLE /* *************** */ = 0b100_0000,
  CLEANUP_VISIBLE /* ******* */ = 0b101_0000,
  WAIT_FOR_ALL /* ********** */ = 0b111_1111,
}

export interface Chore {
  $type$: ChoreType;
  $idx$: number | string;
  $host$: HostElement;
  $target$: HostElement | QRLInternal<(...args: unknown[]) => unknown> | null;
  $payload$: unknown;
  $resolve$: (value: any) => void;
  $promise$: Promise<any>;
  $returnValue$: any;
  $executed$: boolean;
}

export interface NodePropData {
  $scopedStyleIdPrefix$: string | null;
  $isConst$: boolean;
}

export interface NodePropPayload extends NodePropData {
  $value$: Signal<unknown>;
}

export type Scheduler = ReturnType<typeof createScheduler>;

export const createScheduler = (
  container: Container,
  scheduleDrain: () => void,
  journalFlush: () => void
) => {
  const choreQueue: Chore[] = [];

  let currentChore: Chore | null = null;
  let journalFlushScheduled: boolean = false;

  return schedule;

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////

  function schedule(
    type: ChoreType.QRL_RESOLVE,
    ignore: null,
    target: QRLInternal<any>
  ): ValueOrPromise<void>;
  function schedule(type: ChoreType.JOURNAL_FLUSH): ValueOrPromise<void>;
  function schedule(type: ChoreType.WAIT_FOR_ALL): ValueOrPromise<void>;
  function schedule(type: ChoreType.WAIT_FOR_COMPONENTS): ValueOrPromise<void>;
  /**
   * Schedule rendering of a component.
   *
   * @param type
   * @param host - Host element where the component is being rendered.
   * @param qrl - QRL of the component to render.
   * @param props- Props to pass to the component.
   * @param waitForChore? = false
   */
  function schedule(
    type: ChoreType.TASK | ChoreType.VISIBLE | ChoreType.RESOURCE,
    task: Task
  ): ValueOrPromise<void>;
  function schedule(
    type: ChoreType.COMPONENT,
    host: HostElement,
    qrl: QRL<(...args: any[]) => any>,
    props: any
  ): ValueOrPromise<JSXOutput>;
  function schedule(
    type: ChoreType.COMPONENT_SSR,
    host: HostElement,
    qrl: QRL<(...args: any[]) => any>,
    props: any
  ): ValueOrPromise<JSXOutput>;
  function schedule(
    type: ChoreType.NODE_DIFF,
    host: HostElement,
    target: HostElement,
    value: JSXOutput
  ): ValueOrPromise<void>;
  function schedule(
    type: ChoreType.NODE_PROP,
    host: HostElement,
    prop: string,
    value: any
  ): ValueOrPromise<void>;
  function schedule(type: ChoreType.CLEANUP_VISIBLE, task: Task): ValueOrPromise<JSXOutput>;
  ///// IMPLEMENTATION /////
  function schedule(
    type: ChoreType,
    hostOrTask: HostElement | Task | null = null,
    targetOrQrl: HostElement | QRL<(...args: any[]) => any> | string | null = null,
    payload: any = null
  ): ValueOrPromise<any> {
    const runLater: boolean =
      type !== ChoreType.WAIT_FOR_ALL &&
      type !== ChoreType.WAIT_FOR_COMPONENTS &&
      type !== ChoreType.COMPONENT_SSR;
    const isTask =
      type === ChoreType.TASK ||
      type === ChoreType.VISIBLE ||
      type === ChoreType.RESOURCE ||
      type === ChoreType.CLEANUP_VISIBLE;
    if (isTask) {
      (hostOrTask as Task).$flags$ |= TaskFlags.DIRTY;
    }
    let chore: Chore = {
      $type$: type,
      $idx$: isTask
        ? (hostOrTask as Task).$index$
        : typeof targetOrQrl === 'string'
          ? targetOrQrl
          : 0,
      $host$: isTask ? ((hostOrTask as Task).$el$ as fixMeAny) : (hostOrTask as HostElement),
      $target$: targetOrQrl as any,
      $payload$: isTask ? hostOrTask : payload,
      $resolve$: null!,
      $promise$: null!,
      $returnValue$: null,
      $executed$: false,
    };
    chore.$promise$ = new Promise((resolve) => (chore.$resolve$ = resolve));
    DEBUG && debugTrace('schedule', chore, currentChore, choreQueue);
    chore = sortedInsert(choreQueue, chore);
    if (!journalFlushScheduled && runLater) {
      // If we are not currently draining, we need to schedule a drain.
      journalFlushScheduled = true;
      schedule(ChoreType.JOURNAL_FLUSH);
      scheduleDrain();
    }
    if (runLater) {
      return chore.$promise$;
    } else {
      return drainUpTo(chore);
    }
  }

  /**
   * Execute all of the chores up to and including the given chore.
   *
   * @param runUptoChore
   */
  function drainUpTo(runUptoChore: Chore): ValueOrPromise<unknown> {
    // If it already ran, it's not in the queue
    if (runUptoChore.$executed$) {
      return runUptoChore.$returnValue$;
    }
    if (currentChore) {
      // Already running chore, which means we're waiting for async completion
      return runUptoChore.$promise$;
    }
    while (choreQueue.length) {
      const nextChore = choreQueue.shift()!;
      const order = choreComparator(nextChore, runUptoChore, false);
      if (order === null) {
        continue;
      }
      if (order > 0) {
        // we have processed all of the chores up to and including the given chore.
        break;
      }
      const isDeletedVNode = vNodeAlreadyDeleted(nextChore);
      if (
        isDeletedVNode &&
        // we need to process cleanup tasks for deleted nodes
        nextChore.$type$ !== ChoreType.CLEANUP_VISIBLE
      ) {
        DEBUG && debugTrace('skip chore', nextChore, currentChore, choreQueue);
        continue;
      }
      const returnValue = executeChore(nextChore);
      if (isPromise(returnValue)) {
        const promise = returnValue.then(() => drainUpTo(runUptoChore));
        return promise;
      }
    }
    return runUptoChore.$returnValue$;
  }

  function executeChore(chore: Chore): ValueOrPromise<any> {
    const host = chore.$host$;
    DEBUG && debugTrace('execute', chore, currentChore, choreQueue);
    assertEqual(currentChore, null, 'Chore already running.');
    currentChore = chore;
    let returnValue: ValueOrPromise<unknown> | unknown = null;
    switch (chore.$type$) {
      case ChoreType.JOURNAL_FLUSH:
        returnValue = journalFlush();
        journalFlushScheduled = false;
        break;
      case ChoreType.COMPONENT:
      case ChoreType.COMPONENT_SSR:
        returnValue = safeCall(
          () =>
            executeComponent(
              container,
              host,
              host,
              chore.$target$ as fixMeAny,
              chore.$payload$ as fixMeAny
            ),
          (jsx) => {
            return chore.$type$ === ChoreType.COMPONENT
              ? maybeThen(container.processJsx(host, jsx), () => jsx)
              : jsx;
          },
          (err: any) => container.handleError(err, host)
        );
        break;
      case ChoreType.RESOURCE:
        // Don't await the return value of the resource, because async resources should not be awaited.
        // The reason for this is that we should be able to update for example a node with loading
        // text. If we await the resource, the loading text will not be displayed until the resource
        // is loaded.
        const result = runResource(chore.$payload$ as ResourceDescriptor<TaskFn>, container, host);
        returnValue = isDomContainer(container) ? null : result;
        break;
      case ChoreType.TASK:
        returnValue = runTask(chore.$payload$ as Task<TaskFn, TaskFn>, container, host);
        break;
      case ChoreType.VISIBLE:
        returnValue = runTask(chore.$payload$ as Task<TaskFn, TaskFn>, container, host);
        break;
      case ChoreType.CLEANUP_VISIBLE:
        const task = chore.$payload$ as Task<TaskFn, TaskFn>;
        cleanupTask(task);
        break;
      case ChoreType.NODE_DIFF:
        const parentVirtualNode = chore.$target$ as VirtualVNode;
        let jsx = chore.$payload$ as JSXOutput;
        if (isSignal(jsx)) {
          jsx = jsx.value as any;
        }
        returnValue = vnode_diff(container as DomContainer, jsx, parentVirtualNode, null);
        break;
      case ChoreType.NODE_PROP:
        const virtualNode = chore.$host$ as unknown as ElementVNode;
        const payload = chore.$payload$ as NodePropPayload;
        let value: Signal<any> | string = payload.$value$;
        if (isSignal(value)) {
          value = value.value as any;
        }
        const isConst = payload.$isConst$;
        const journal = (container as DomContainer).$journal$;
        const property = chore.$idx$ as string;
        value = serializeAttribute(property, value, payload.$scopedStyleIdPrefix$);
        if (isConst) {
          const element = virtualNode[ElementVNodeProps.element] as Element;
          journal.push(VNodeJournalOpCode.SetAttribute, element, property, value);
        } else {
          vnode_setAttr(journal, virtualNode, property, value);
        }
        break;
      case ChoreType.QRL_RESOLVE: {
        const target = chore.$target$ as QRLInternal<any>;
        returnValue = !target.resolved ? target.resolve() : null;
        break;
      }
    }
    return maybeThenPassError(returnValue, (value) => {
      DEBUG && debugTrace('execute.DONE', null, currentChore, choreQueue);
      if (currentChore) {
        currentChore.$executed$ = true;
        currentChore.$resolve$?.(value);
      }
      currentChore = null;
      return (chore.$returnValue$ = value);
    });
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

function vNodeAlreadyDeleted(chore: Chore): boolean {
  return !!(
    chore.$host$ &&
    vnode_isVNode(chore.$host$) &&
    chore.$host$[VNodeProps.flags] & VNodeFlags.Deleted
  );
}

/**
 * Compares two chores to determine their execution order in the scheduler's queue.
 *
 * @param a - The first chore to compare
 * @param b - The second chore to compare
 * @param shouldThrowOnHostMismatch - Controls error behavior for mismatched hosts
 * @returns A number indicating the relative order of the chores, or null if invalid. A negative
 *   number means `a` runs before `b`.
 */
function choreComparator(a: Chore, b: Chore, shouldThrowOnHostMismatch: true): number;
function choreComparator(a: Chore, b: Chore, shouldThrowOnHostMismatch: false): number | null;
function choreComparator(a: Chore, b: Chore, shouldThrowOnHostMismatch: boolean): number | null {
  const macroTypeDiff = (a.$type$ & ChoreType.MACRO) - (b.$type$ & ChoreType.MACRO);
  if (macroTypeDiff !== 0) {
    return macroTypeDiff;
  }

  // JOURNAL_FLUSH does not have a host or $idx$, so we can't compare it.
  if (a.$type$ !== ChoreType.JOURNAL_FLUSH) {
    const aHost = a.$host$;
    const bHost = b.$host$;

    // QRL_RESOLVE does not have a host.
    if (aHost !== bHost && aHost !== null && bHost !== null) {
      if (vnode_isVNode(aHost) && vnode_isVNode(bHost)) {
        // we are running on the client.
        const hostDiff = vnode_documentPosition(aHost, bHost);
        if (hostDiff !== 0) {
          return hostDiff;
        }
      } else {
        // we are running on the server.
        // On server we can't schedule task for a different host!
        // Server is SSR, and therefore scheduling for anything but the current host
        // implies that things need to be re-run nad that is not supported because of streaming.
        const errorMessage =
          'SERVER: during HTML streaming, it is not possible to cause a re-run of tasks on a different host';
        if (shouldThrowOnHostMismatch) {
          throwErrorAndStop(errorMessage);
        }
        logWarn(errorMessage);
        return null;
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

    // If the host is the same, we need to compare the target.
    if (
      a.$target$ !== b.$target$ &&
      ((a.$type$ === ChoreType.QRL_RESOLVE && b.$type$ === ChoreType.QRL_RESOLVE) ||
        (a.$type$ === ChoreType.NODE_PROP && b.$type$ === ChoreType.NODE_PROP))
    ) {
      // 1 means that we are going to process chores as FIFO
      return 1;
    }
  }

  return 0;
}

function sortedFindIndex(sortedArray: Chore[], value: Chore): number {
  /// We need to ensure that the `queue` is sorted by priority.
  /// 1. Find a place where to insert into.
  let bottom = 0;
  let top = sortedArray.length;
  while (bottom < top) {
    const middle = bottom + ((top - bottom) >> 1);
    const midChore = sortedArray[middle];
    const comp = choreComparator(value, midChore, true);
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

function sortedInsert(sortedArray: Chore[], value: Chore): Chore {
  /// We need to ensure that the `queue` is sorted by priority.
  /// 1. Find a place where to insert into.
  const idx = sortedFindIndex(sortedArray, value);
  if (idx < 0) {
    /// 2. Insert the chore into the queue.
    sortedArray.splice(~idx, 0, value);
    return value;
  }
  const existing = sortedArray[idx];
  choreUpdate(existing, value);
  return existing;
}

function debugChoreToString(chore: Chore): string {
  const type =
    (
      {
        [ChoreType.QRL_RESOLVE]: 'QRL_RESOLVE',
        [ChoreType.RESOURCE]: 'RESOURCE',
        [ChoreType.TASK]: 'TASK',
        [ChoreType.NODE_DIFF]: 'NODE_DIFF',
        [ChoreType.NODE_PROP]: 'NODE_PROP',
        [ChoreType.COMPONENT]: 'COMPONENT',
        [ChoreType.COMPONENT_SSR]: 'COMPONENT_SSR',
        [ChoreType.JOURNAL_FLUSH]: 'JOURNAL_FLUSH',
        [ChoreType.VISIBLE]: 'VISIBLE',
        [ChoreType.CLEANUP_VISIBLE]: 'CLEANUP_VISIBLE',
        [ChoreType.WAIT_FOR_ALL]: 'WAIT_FOR_ALL',
        [ChoreType.WAIT_FOR_COMPONENTS]: 'WAIT_FOR_COMPONENTS',
      } as any
    )[chore.$type$] || 'UNKNOWN: ' + chore.$type$;
  const host = String(chore.$host$).replaceAll(/\n.*/gim, '');
  const qrlTarget = (chore.$target$ as QRLInternal<any>)?.$symbol$;
  return `Chore(${type} ${chore.$type$ === ChoreType.QRL_RESOLVE ? qrlTarget : host} ${chore.$idx$})`;
}

function debugTrace(
  action: string,
  arg?: any | null,
  currentChore?: Chore | null,
  queue?: Chore[]
) {
  const lines = ['Scheduler: ' + action];
  if (arg) {
    lines.push(
      '    arg: ' +
        ('$type$' in arg ? debugChoreToString(arg as Chore) : String(arg).replaceAll(/\n.*/gim, ''))
    );
  }
  if (currentChore) {
    lines.push('running: ' + debugChoreToString(currentChore));
  }
  if (queue) {
    queue.forEach((chore, idx) => {
      lines.push((idx == 0 ? '  queue: ' : '         ') + debugChoreToString(chore));
    });
  }
  // eslint-disable-next-line no-console
  console.log(lines.join('\n  ') + '\n');
}
