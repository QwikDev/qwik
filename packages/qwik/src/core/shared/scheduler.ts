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

import { isDomContainer, type DomContainer } from '../client/dom-container';
import {
  ElementVNodeProps,
  VNodeFlags,
  VNodeProps,
  type ClientContainer,
  type ElementVNode,
  type VirtualVNode,
} from '../client/types';
import { VNodeJournalOpCode, vnode_isVNode, vnode_setAttr } from '../client/vnode';
import { vnode_diff } from '../client/vnode-diff';
import { triggerEffects, type ComputedSignal, type WrappedSignal } from '../signal/signal';
import { isSignal, type Signal } from '../signal/signal.public';
import type { TargetType } from '../signal/store';
import type { ISsrNode } from '../ssr/ssr-types';
import { runResource, type ResourceDescriptor } from '../use/use-resource';
import { Task, TaskFlags, cleanupTask, runTask, type TaskFn } from '../use/use-task';
import { executeComponent } from './component-execution';
import type { OnRenderFn } from './component.public';
import { assertEqual, assertFalse } from './error/assert';
import type { Props } from './jsx/jsx-runtime';
import type { JSXOutput } from './jsx/types/jsx-node';
import { type QRLInternal } from './qrl/qrl-class';
import { ssrNodeDocumentPosition, vnode_documentPosition } from './scheduler-document-position';
import type { Container, HostElement } from './types';
import { logWarn } from './utils/log';
import { QScopedStyle } from './utils/markers';
import { isPromise, retryOnPromise, safeCall } from './utils/promises';
import { addComponentStylePrefix } from './utils/scoped-styles';
import { serializeAttribute } from './utils/styles';
import type { ValueOrPromise } from './utils/types';

// Turn this on to get debug output of what the scheduler is doing.
const DEBUG: boolean = false;

export const enum ChoreType {
  /// MASKS defining three levels of sorting
  MACRO /* **************************** */ = 0b1111_0000,
  /* order of elements (not encoded here) */
  MICRO /* **************************** */ = 0b0000_1111,

  /** Ensure that the QRL promise is resolved before processing next chores in the queue */
  QRL_RESOLVE /* ********************** */ = 0b0000_0001,
  RUN_QRL,
  RESOURCE,
  TASK,
  NODE_DIFF,
  NODE_PROP,
  COMPONENT,
  RECOMPUTE_AND_SCHEDULE_EFFECTS,

  // Next macro level
  JOURNAL_FLUSH /* ******************** */ = 0b0001_0000,
  // Next macro level
  VISIBLE /* ************************** */ = 0b0010_0000,
  // Next macro level
  CLEANUP_VISIBLE /* ****************** */ = 0b0011_0000,
  // Next macro level
  WAIT_FOR_ALL /* ********************* */ = 0b1111_1111,
}

export interface Chore {
  $type$: ChoreType;
  $idx$: number | string;
  $host$: HostElement;
  $target$: ChoreTarget | null;
  $payload$: unknown;
  $resolve$?: (value: any) => void;
  $promise$?: Promise<any>;
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

type ChoreTarget = HostElement | QRLInternal<(...args: unknown[]) => unknown> | Signal | TargetType;

const getPromise = (chore: Chore) =>
  (chore.$promise$ ||= new Promise((resolve) => {
    chore.$resolve$ = resolve;
  }));

export const createScheduler = (
  container: Container,
  scheduleDrain: () => void,
  journalFlush: () => void
) => {
  const choreQueue: Chore[] = [];
  const qrlRuns: Promise<any>[] = [];

  let currentChore: Chore | null = null;
  let drainScheduled: boolean = false;

  return schedule;

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////

  function schedule(
    type: ChoreType.QRL_RESOLVE,
    ignore: null,
    target: QRLInternal<(...args: unknown[]) => unknown>
  ): ValueOrPromise<void>;
  function schedule(type: ChoreType.JOURNAL_FLUSH): ValueOrPromise<void>;
  function schedule(type: ChoreType.WAIT_FOR_ALL): ValueOrPromise<void>;
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
    type: ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
    host: HostElement | null,
    target: Signal
  ): ValueOrPromise<void>;
  function schedule(
    type: ChoreType.TASK | ChoreType.VISIBLE | ChoreType.RESOURCE,
    task: Task
  ): ValueOrPromise<void>;
  function schedule(
    type: ChoreType.RUN_QRL,
    host: HostElement,
    target: QRLInternal<(...args: unknown[]) => unknown>,
    args: unknown[]
  ): ValueOrPromise<void>;
  function schedule(
    type: ChoreType.COMPONENT,
    host: HostElement,
    qrl: QRLInternal<OnRenderFn<unknown>>,
    props: Props | null
  ): ValueOrPromise<JSXOutput>;
  function schedule(
    type: ChoreType.NODE_DIFF,
    host: HostElement,
    target: HostElement,
    value: JSXOutput | Signal
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
    targetOrQrl: ChoreTarget | string | null = null,
    payload: any = null
  ): ValueOrPromise<any> {
    const isServer = !isDomContainer(container);
    const isComponentSsr = isServer && type === ChoreType.COMPONENT;

    const runLater: boolean =
      type !== ChoreType.WAIT_FOR_ALL && !isComponentSsr && type !== ChoreType.RUN_QRL;
    const isTask =
      type === ChoreType.TASK ||
      type === ChoreType.VISIBLE ||
      type === ChoreType.RESOURCE ||
      type === ChoreType.CLEANUP_VISIBLE;
    const isClientOnly =
      type === ChoreType.JOURNAL_FLUSH ||
      type === ChoreType.NODE_DIFF ||
      type === ChoreType.NODE_PROP;
    if (isServer && isClientOnly) {
      DEBUG &&
        debugTrace(
          `skip client chore ${debugChoreTypeToString(type)}`,
          null,
          currentChore,
          choreQueue
        );
      return;
    }

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
      $host$: isTask ? (hostOrTask as Task).$el$ : (hostOrTask as HostElement),
      $target$: targetOrQrl as ChoreTarget | null,
      $payload$: isTask ? hostOrTask : payload,
      $resolve$: null!,
      $promise$: null!,
      $returnValue$: null,
      $executed$: false,
    };

    chore = sortedInsert(choreQueue, chore, (container as DomContainer).rootVNode || null);

    DEBUG && debugTrace('schedule', chore, currentChore, choreQueue);
    if (!drainScheduled && runLater) {
      // If we are not currently draining, we need to schedule a drain.
      drainScheduled = true;
      schedule(ChoreType.JOURNAL_FLUSH);
      // Catch here to avoid unhandled promise rejection
      (scheduleDrain() as any)?.catch?.(() => {});
    }
    // TODO figure out what to do with chore errors
    if (runLater) {
      return getPromise(chore);
    } else {
      return drainUpTo(chore, isServer);
    }
  }

  /** Execute all of the chores up to and including the given chore. */
  function drainUpTo(runUptoChore: Chore, isServer: boolean): ValueOrPromise<unknown> {
    let maxRetries = 5000;
    while (choreQueue.length) {
      if (maxRetries-- < 0) {
        throw new Error('drainUpTo: max retries reached');
      }

      if (currentChore) {
        // Already running chore, which means we're waiting for async completion
        return getPromise(currentChore)
          .then(() => drainUpTo(runUptoChore, isServer))
          .catch((e) => {
            container.handleError(e, currentChore?.$host$ as any);
          });
      }

      const nextChore = choreQueue[0];

      if (nextChore.$executed$) {
        if (
          nextChore === runUptoChore &&
          nextChore.$type$ === ChoreType.WAIT_FOR_ALL &&
          qrlRuns.length
        ) {
          return Promise.all(qrlRuns)
            .catch(() => {
              // they are already handled by the qrl runs
            })
            .then(() => drainUpTo(runUptoChore, isServer));
        }
        choreQueue.shift();
        if (nextChore === runUptoChore) {
          break;
        }
        continue;
      }

      if (
        vNodeAlreadyDeleted(nextChore) &&
        // we need to process cleanup tasks for deleted nodes
        nextChore.$type$ !== ChoreType.CLEANUP_VISIBLE
      ) {
        DEBUG && debugTrace('skip chore', nextChore, currentChore, choreQueue);
        choreQueue.shift();
        continue;
      }

      executeChore(nextChore, isServer);
    }
    return runUptoChore.$returnValue$;
  }

  function executeChore(chore: Chore, isServer: boolean) {
    const host = chore.$host$;
    DEBUG && debugTrace('execute', chore, currentChore, choreQueue);
    assertEqual(currentChore, null, 'Chore already running.');
    currentChore = chore;
    let returnValue: ValueOrPromise<unknown> | unknown = null;
    try {
      switch (chore.$type$) {
        case ChoreType.WAIT_FOR_ALL:
          {
            if (isServer) {
              drainScheduled = false;
            }
          }
          break;
        case ChoreType.JOURNAL_FLUSH:
          {
            returnValue = journalFlush();
            drainScheduled = false;
          }
          break;
        case ChoreType.COMPONENT:
          {
            returnValue = safeCall(
              () =>
                executeComponent(
                  container,
                  host,
                  host,
                  chore.$target$ as QRLInternal<OnRenderFn<unknown>>,
                  chore.$payload$ as Props | null
                ),
              (jsx) => {
                if (isServer) {
                  return jsx;
                } else {
                  const styleScopedId = container.getHostProp<string>(host, QScopedStyle);
                  return retryOnPromise(() =>
                    vnode_diff(
                      container as ClientContainer,
                      jsx,
                      host as VirtualVNode,
                      addComponentStylePrefix(styleScopedId)
                    )
                  );
                }
              },
              (err: any) => container.handleError(err, host)
            );
          }
          break;
        case ChoreType.RESOURCE:
          {
            const result = runResource(
              chore.$payload$ as ResourceDescriptor<TaskFn>,
              container,
              host
            );
            // Don't await the return value of the resource, because async resources should not be awaited.
            // The reason for this is that we should be able to update for example a node with loading
            // text. If we await the resource, the loading text will not be displayed until the resource
            // is loaded.
            // Awaiting on the client also causes a deadlock.
            // In any case, the resource will never throw.
            returnValue = isServer ? result : null;
          }
          break;
        case ChoreType.RUN_QRL:
          {
            const fn = (chore.$target$ as QRLInternal<(...args: unknown[]) => unknown>).getFn();
            const result = retryOnPromise(() => fn(...(chore.$payload$ as unknown[])));
            if (isPromise(result)) {
              const handled = result
                .finally(() => {
                  qrlRuns.splice(qrlRuns.indexOf(handled), 1);
                })
                .catch((error) => {
                  container.handleError(error, chore.$host$);
                });
              // Don't wait for the promise to resolve
              // TODO come up with a better solution, we also want concurrent signal handling with tasks but serial tasks
              qrlRuns.push(handled);
              DEBUG &&
                debugTrace('execute.DONE (but still running)', chore, currentChore, choreQueue);
              chore.$returnValue$ = handled;
              chore.$resolve$?.(handled);
              currentChore = null;
              chore.$executed$ = true;
              // early out so we don't call after()
              return;
            }
            returnValue = null;
          }
          break;
        case ChoreType.TASK:
        case ChoreType.VISIBLE:
          returnValue = runTask(chore.$payload$ as Task<TaskFn, TaskFn>, container, host);
          break;
        case ChoreType.CLEANUP_VISIBLE:
          {
            const task = chore.$payload$ as Task<TaskFn, TaskFn>;
            cleanupTask(task);
          }
          break;
        case ChoreType.NODE_DIFF:
          {
            const parentVirtualNode = chore.$target$ as VirtualVNode;
            let jsx = chore.$payload$ as JSXOutput;
            if (isSignal(jsx)) {
              jsx = jsx.value as any;
            }
            returnValue = retryOnPromise(() =>
              vnode_diff(container as DomContainer, jsx, parentVirtualNode, null)
            );
          }
          break;
        case ChoreType.NODE_PROP:
          {
            const virtualNode = chore.$host$ as unknown as ElementVNode;
            const payload = chore.$payload$ as NodePropPayload;
            let value: Signal<any> | string = payload.$value$;
            if (isSignal(value)) {
              value = value.value as any;
            }
            const isConst = payload.$isConst$;
            const journal = (container as DomContainer).$journal$;
            const property = chore.$idx$ as string;
            const serializedValue = serializeAttribute(
              property,
              value,
              payload.$scopedStyleIdPrefix$
            );
            if (isConst) {
              const element = virtualNode[ElementVNodeProps.element] as Element;
              journal.push(VNodeJournalOpCode.SetAttribute, element, property, serializedValue);
            } else {
              vnode_setAttr(journal, virtualNode, property, serializedValue);
            }
          }
          break;
        case ChoreType.QRL_RESOLVE: {
          {
            const target = chore.$target$ as QRLInternal<any>;
            returnValue = !target.resolved ? target.resolve() : null;
          }
          break;
        }
        case ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS: {
          {
            const target = chore.$target$ as ComputedSignal<unknown> | WrappedSignal<unknown>;
            const forceRunEffects = target.$forceRunEffects$;
            target.$forceRunEffects$ = false;
            if (!target.$effects$?.length) {
              break;
            }
            returnValue = retryOnPromise(() => {
              if (target.$computeIfNeeded$() || forceRunEffects) {
                triggerEffects(container, target, target.$effects$);
              }
            });
          }
          break;
        }
      }
    } catch (e) {
      returnValue = Promise.reject(e);
    }

    const after = (value?: any, error?: Error) => {
      currentChore = null;
      chore.$executed$ = true;
      if (error) {
        DEBUG && debugTrace('execute.ERROR', chore, currentChore, choreQueue);
        container.handleError(error, host);
      } else {
        chore.$returnValue$ = value;
        DEBUG && debugTrace('execute.DONE', chore, currentChore, choreQueue);
        chore.$resolve$?.(value);
      }
    };

    if (isPromise(returnValue)) {
      chore.$promise$ = returnValue.then(after, (error) => after(undefined, error));
      chore.$resolve$?.(chore.$promise$);
      chore.$resolve$ = undefined;
    } else {
      after(returnValue);
    }
  }

  /**
   * Compares two chores to determine their execution order in the scheduler's queue.
   *
   * @param a - The first chore to compare
   * @param b - The second chore to compare
   * @returns A number indicating the relative order of the chores. A negative number means `a` runs
   *   before `b`.
   */
  function choreComparator(a: Chore, b: Chore, rootVNode: ElementVNode | null): number {
    const macroTypeDiff = (a.$type$ & ChoreType.MACRO) - (b.$type$ & ChoreType.MACRO);
    if (macroTypeDiff !== 0) {
      return macroTypeDiff;
    }

    const aHost = a.$host$;
    const bHost = b.$host$;

    if (aHost !== bHost && aHost !== null && bHost !== null) {
      if (vnode_isVNode(aHost) && vnode_isVNode(bHost)) {
        // we are running on the client.
        const hostDiff = vnode_documentPosition(aHost, bHost, rootVNode);
        if (hostDiff !== 0) {
          return hostDiff;
        }
      } else {
        assertFalse(vnode_isVNode(aHost), 'expected aHost to be SSRNode but it is a VNode');
        assertFalse(vnode_isVNode(bHost), 'expected bHost to be SSRNode but it is a VNode');
        // we are running on the server.
        // On server we can't schedule task for a different host!
        // Server is SSR, and therefore scheduling for anything but the current host
        // implies that things need to be re-run nad that is not supported because of streaming.
        const errorMessage = `SERVER: during HTML streaming, re-running tasks on a different host is not allowed.
          You are attempting to change a state that has already been streamed to the client.
          This can lead to inconsistencies between Server-Side Rendering (SSR) and Client-Side Rendering (CSR).
          Problematic Node: ${aHost.toString()}`;
        logWarn(errorMessage);
        const hostDiff = ssrNodeDocumentPosition(aHost as ISsrNode, bHost as ISsrNode);
        if (hostDiff !== 0) {
          return hostDiff;
        }
      }
    }

    const microTypeDiff = (a.$type$ & ChoreType.MICRO) - (b.$type$ & ChoreType.MICRO);
    if (microTypeDiff !== 0) {
      return microTypeDiff;
    }
    // types are the same

    const idxDiff = toNumber(a.$idx$) - toNumber(b.$idx$);
    if (idxDiff !== 0) {
      return idxDiff;
    }

    // If the host is the same (or missing), and the type is the same,  we need to compare the target.
    if (a.$target$ !== b.$target$ || a.$payload$ !== b.$payload$) {
      // 1 means that we are going to process chores as FIFO
      return 1;
    }

    // If the chore is the same as the current chore, we will run it again
    if (b === currentChore) {
      return 1;
    }

    // The chores are the same and will run only once
    return 0;
  }

  function sortedFindIndex(
    sortedArray: Chore[],
    value: Chore,
    rootVNode: ElementVNode | null
  ): number {
    /// We need to ensure that the `queue` is sorted by priority.
    /// 1. Find a place where to insert into.
    let bottom = 0;
    let top = sortedArray.length;
    while (bottom < top) {
      const middle = bottom + ((top - bottom) >> 1);
      const midChore = sortedArray[middle];
      const comp = choreComparator(value, midChore, rootVNode);
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

  function sortedInsert(sortedArray: Chore[], value: Chore, rootVNode: ElementVNode | null): Chore {
    /// We need to ensure that the `queue` is sorted by priority.
    /// 1. Find a place where to insert into.
    const idx = sortedFindIndex(sortedArray, value, rootVNode);

    if (idx < 0) {
      /// 2. Insert the chore into the queue.
      sortedArray.splice(~idx, 0, value);
      return value;
    }

    const existing = sortedArray[idx];
    /**
     * When a derived signal is updated we need to run vnode_diff. However the signal can update
     * multiple times during component execution. For this reason it is necessary for us to update
     * the chore with the latest result of the signal.
     */
    if (existing.$type$ === ChoreType.NODE_DIFF) {
      existing.$payload$ = value.$payload$;
    }
    if (existing.$executed$) {
      existing.$executed$ = false;
    }
    return existing;
  }
};

const toNumber = (value: number | string): number => {
  return typeof value === 'number' ? value : -1;
};

function vNodeAlreadyDeleted(chore: Chore): boolean {
  return !!(
    chore.$host$ &&
    vnode_isVNode(chore.$host$) &&
    chore.$host$[VNodeProps.flags] & VNodeFlags.Deleted
  );
}

function debugChoreTypeToString(type: ChoreType): string {
  return (
    (
      {
        [ChoreType.QRL_RESOLVE]: 'QRL_RESOLVE',
        [ChoreType.RUN_QRL]: 'RUN_QRL',
        [ChoreType.RESOURCE]: 'RESOURCE',
        [ChoreType.TASK]: 'TASK',
        [ChoreType.NODE_DIFF]: 'NODE_DIFF',
        [ChoreType.NODE_PROP]: 'NODE_PROP',
        [ChoreType.COMPONENT]: 'COMPONENT',
        [ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS]: 'RECOMPUTE_SIGNAL',
        [ChoreType.JOURNAL_FLUSH]: 'JOURNAL_FLUSH',
        [ChoreType.VISIBLE]: 'VISIBLE',
        [ChoreType.CLEANUP_VISIBLE]: 'CLEANUP_VISIBLE',
        [ChoreType.WAIT_FOR_ALL]: 'WAIT_FOR_ALL',
      } as Record<ChoreType, string>
    )[type] || 'UNKNOWN: ' + type
  );
}
function debugChoreToString(chore: Chore): string {
  const type = debugChoreTypeToString(chore.$type$);
  const host = String(chore.$host$).replaceAll(/\n.*/gim, '');
  const qrlTarget = (chore.$target$ as QRLInternal<any>)?.$symbol$;
  return `Chore(${type} ${chore.$type$ === ChoreType.QRL_RESOLVE || chore.$type$ === ChoreType.RUN_QRL ? qrlTarget : host} ${chore.$idx$})`;
}

function debugTrace(
  action: string,
  arg?: any | null,
  currentChore?: Chore | null,
  queue?: Chore[]
) {
  const lines = ['===========================\nScheduler: ' + action];
  if (arg && !('$type$' in arg)) {
    lines.push('      arg: ' + String(arg).replaceAll(/\n.*/gim, ''));
  }
  if (queue) {
    queue.forEach((chore) => {
      const active = chore === arg ? '>>>' : '   ';
      lines.push(
        `     ${active} > ` +
          (chore === currentChore ? '[running] ' : '') +
          debugChoreToString(chore)
      );
    });
  }
  // eslint-disable-next-line no-console
  console.log(lines.join('\n') + '\n');
}
