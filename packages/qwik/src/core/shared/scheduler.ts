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
 *
 * Blocking chores:
 *
 * - RUN_QRL -> TASK
 * - TASK -> subsequent TASK
 * - COMPONENT -> NODE_DIFF
 * - COMPONENT -> TRIGGER_EFFECTS
 * - QRL_RESOLVE -> RUN_QRL, COMPONENT
 */

import { type DomContainer } from '../client/dom-container';
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
import { triggerEffects } from '../reactive-primitives/utils';
import { isSignal, type Signal } from '../reactive-primitives/signal.public';
import {
  type AsyncComputeQRL,
  type ComputeQRL,
  type EffectSubscription,
  type StoreTarget,
} from '../reactive-primitives/types';
import type { ISsrNode } from '../ssr/ssr-types';
import { runResource, type ResourceDescriptor } from '../use/use-resource';
import {
  Task,
  TaskFlags,
  cleanupTask,
  runTask,
  type DescriptorBase,
  type TaskFn,
} from '../use/use-task';
import { ChoreType } from './util-chore-type';
import { executeComponent } from './component-execution';
import type { OnRenderFn } from './component.public';
import { assertFalse } from './error/assert';
import type { Props } from './jsx/jsx-runtime';
import type { JSXOutput } from './jsx/types/jsx-node';
import { type QRLInternal } from './qrl/qrl-class';
import { ssrNodeDocumentPosition, vnode_documentPosition } from './scheduler-document-position';
import type { Container, HostElement } from './types';
import { logWarn } from './utils/log';
import { ELEMENT_SEQ, QScopedStyle } from './utils/markers';
import { isPromise, retryOnPromise, safeCall } from './utils/promises';
import { addComponentStylePrefix } from './utils/scoped-styles';
import { serializeAttribute } from './utils/styles';
import { isNumber, type ValueOrPromise } from './utils/types';
import type { NodePropPayload } from '../reactive-primitives/subscription-data';
import { ComputedSignalImpl } from '../reactive-primitives/impl/computed-signal-impl';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import type { StoreHandler } from '../reactive-primitives/impl/store';
import { SignalImpl } from '../reactive-primitives/impl/signal-impl';
import { getPlatform, isServerPlatform } from './platform/platform';
import { AsyncComputedSignalImpl } from '../reactive-primitives/impl/async-computed-signal-impl';

// Turn this on to get debug output of what the scheduler is doing.
const DEBUG: boolean = false;

export interface Chore {
  $type$: ChoreType;
  $idx$: number | string;
  $host$: HostElement;
  $target$: ChoreTarget | null;
  $payload$: unknown;
  $pending$: boolean;
  $blockedChores$: Chore[] | null;

  $promise$?: Promise<any>;
  $resolve$?: (value: any) => void;
  $reject$?: (reason?: any) => void;
  $returnValue$: any;
}

export type Scheduler = ReturnType<typeof createScheduler>;

type ChoreTarget =
  | HostElement
  | QRLInternal<(...args: unknown[]) => unknown>
  | Signal
  | StoreTarget;

export const getChorePromise = (chore: Chore) =>
  (chore.$promise$ ||= new Promise((resolve, reject) => {
    chore.$resolve$ = resolve;
    chore.$reject$ = reject;
  }));

export const createScheduler = (container: Container, journalFlush: () => void) => {
  const choreQueue: Chore[] = [];

  let drainChore: Chore | null = null;
  let drainScheduled = false;
  let runningChoresCount = 0;
  let isDraining = false;

  function drainInNextTick() {
    if (!drainScheduled) {
      drainScheduled = true;
      getPlatform().nextTick(() => drainChoreQueue());
    }
  }
  // Drain for ~16.67ms, then apply journal flush for ~16.67ms, then repeat
  // We divide by 60 because we want to run at 60fps
  const FREQUENCY_MS = Math.floor(1000 / 60);

  return { schedule, drainChoreQueue };

  ////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////////////////////////////

  function schedule(
    type: ChoreType.QRL_RESOLVE,
    ignore: null,
    target: ComputeQRL<any> | AsyncComputeQRL<any>
  ): Chore;
  function schedule(type: ChoreType.WAIT_FOR_QUEUE): Chore;
  /**
   * Schedule rendering of a component.
   *
   * @param type
   * @param host - Host element where the component is being rendered.
   * @param target
   */
  function schedule(
    type: ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
    host: HostElement | null,
    target: Signal | StoreHandler,
    effects: Set<EffectSubscription> | null
  ): Chore;
  function schedule(type: ChoreType.TASK | ChoreType.VISIBLE, task: Task): Chore;
  function schedule(
    type: ChoreType.RUN_QRL,
    host: HostElement,
    target: QRLInternal<(...args: unknown[]) => unknown>,
    args: unknown[]
  ): Chore;
  function schedule(
    type: ChoreType.COMPONENT,
    host: HostElement,
    qrl: QRLInternal<OnRenderFn<unknown>>,
    props: Props | null
  ): Chore;
  function schedule(
    type: ChoreType.NODE_DIFF,
    host: HostElement,
    target: HostElement,
    value: JSXOutput | Signal
  ): Chore;
  function schedule(type: ChoreType.NODE_PROP, host: HostElement, prop: string, value: any): Chore;
  function schedule(type: ChoreType.CLEANUP_VISIBLE, task: Task): Chore;
  ///// IMPLEMENTATION /////
  function schedule(
    type: ChoreType,
    hostOrTask: HostElement | Task | null = null,
    targetOrQrl: ChoreTarget | string | null = null,
    payload: any = null
  ): Chore {
    if (type === ChoreType.WAIT_FOR_QUEUE && drainChore) {
      return drainChore;
    }

    const isTask =
      type === ChoreType.TASK || type === ChoreType.VISIBLE || type === ChoreType.CLEANUP_VISIBLE;

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
      $pending$: false,
      $blockedChores$: null,
      $returnValue$: null,
    };

    if (type === ChoreType.WAIT_FOR_QUEUE) {
      getChorePromise(chore);
      drainChore = chore;
      // TODO: I think this is not right, because we can drain the same queue twice
      immediateDrain();
      return chore;
    }

    const isServer = isServerPlatform();
    const isClientOnly =
      type === ChoreType.NODE_DIFF ||
      type === ChoreType.NODE_PROP ||
      type === ChoreType.QRL_RESOLVE;
    if (isServer && isClientOnly) {
      DEBUG && debugTrace(`skip client chore ${debugChoreTypeToString(type)}`, null, choreQueue);
      // TODO mark done?
      return chore;
    }

    let blocked = false;
    if (
      chore.$type$ === ChoreType.RUN_QRL ||
      chore.$type$ === ChoreType.TASK ||
      chore.$type$ === ChoreType.VISIBLE
    ) {
      const component = chore.$host$;
      // TODO optimize
      const qrlChore = choreQueue.find(
        (c) => c.$type$ === ChoreType.QRL_RESOLVE && c.$host$ === component
      );
      if (qrlChore) {
        qrlChore.$blockedChores$ ||= [];
        qrlChore.$blockedChores$.push(chore);
        blocked = true;
      }
    }

    if (chore.$type$ === ChoreType.NODE_DIFF || chore.$type$ === ChoreType.NODE_PROP) {
      // blocked by its component chore
      const component = chore.$host$;
      // TODO: better way to find the component chore
      const componentChore = choreQueue.find(
        (c) => c.$type$ === ChoreType.COMPONENT && c.$host$ === component
      );
      if (componentChore) {
        componentChore.$blockedChores$ ||= [];
        componentChore.$blockedChores$.push(chore);
        blocked = true;
      }
    } else if (chore.$type$ === ChoreType.TASK) {
      // Tasks are blocking other tasks in the same component
      // They should be executed in the order of declaration
      if (isNumber(chore.$idx$) && chore.$idx$ > 0) {
        // For tasks with index > 0, they are probably blocked by a previous task
        const component = chore.$host$;
        const elementSeq = container.getHostProp<unknown[] | null>(component, ELEMENT_SEQ);
        if (elementSeq) {
          let currentTaskFound = false;
          for (let i = chore.$idx$; i > 0; i--) {
            const task = elementSeq[i];
            if (task && chore.$payload$ === task) {
              currentTaskFound = true;
              continue;
            } else if (currentTaskFound && task instanceof Task && task.$flags$ & TaskFlags.TASK) {
              // Find the chore for the task
              const taskChore = choreQueue.find((c) => c.$payload$ === task);
              if (taskChore) {
                // Add the chore to the blocked chores of the previous task
                taskChore.$blockedChores$ ||= [];
                taskChore.$blockedChores$.push(chore);
                blocked = true;
              }
            }
          }
        }
      }
    }
    if (!blocked) {
      chore = sortedInsert(choreQueue, chore, (container as DomContainer).rootVNode || null);
      DEBUG && debugTrace('schedule', chore, choreQueue);
    } else {
      DEBUG && debugTrace('skip blocked chore', chore, choreQueue);
    }

    if (isServer && type === ChoreType.COMPONENT && !isDraining) {
      immediateDrain();
    } else {
      drainInNextTick();
    }
    return chore;
  }

  function immediateDrain() {
    drainScheduled = true;
    drainChoreQueue();
  }

  function drainChoreQueue(): void {
    isDraining = true;
    const isServer = isServerPlatform();
    const startTime = performance.now();
    let now = 0;

    const shouldApplyJournalFlush = () => {
      return !isServer && now - startTime > FREQUENCY_MS;
    };

    const applyJournalFlush = () => {
      journalFlush();
      DEBUG && debugTrace('journalFlush.DONE', null, choreQueue);
    };

    const maybeFinishDrain = () => {
      if (choreQueue.length) {
        return drainChoreQueue();
      }
      if (runningChoresCount || !drainScheduled) {
        if (shouldApplyJournalFlush()) {
          // apply journal flush even if we are not finished draining the queue
          applyJournalFlush();
        }
        return;
      }
      currentChore = null;
      drainScheduled = false;
      isDraining = false;
      applyJournalFlush();
      drainChore?.$resolve$!(null);
      drainChore = null;
      DEBUG && debugTrace('drain.DONE', drainChore, choreQueue);
    };

    const scheduleBlockedChoresAndDrainIfNeeded = (chore: Chore) => {
      if (chore.$blockedChores$) {
        const rootVNode = (container as DomContainer).rootVNode || null;
        for (const blockedChore of chore.$blockedChores$) {
          DEBUG && debugTrace('schedule blocked chore', blockedChore, choreQueue);
          sortedInsert(choreQueue, blockedChore, rootVNode);
        }
        chore.$blockedChores$ = null;
      }
      drainInNextTick();
    };

    let currentChore: Chore | null = null;

    try {
      while (choreQueue.length) {
        now = performance.now();

        currentChore = choreQueue.shift()!;

        if (currentChore.$pending$) {
          continue;
        }

        if (
          vNodeAlreadyDeleted(currentChore) &&
          // we need to process cleanup tasks for deleted nodes
          currentChore.$type$ !== ChoreType.CLEANUP_VISIBLE
        ) {
          // skip deleted chore
          DEBUG && debugTrace('skip chore', currentChore, choreQueue);
          continue;
        }
        // TODO: check if chore is blocked by another chore
        const result = executeChore(currentChore, isServer);
        if (isPromise(result)) {
          runningChoresCount++;
          currentChore.$pending$ = true;
          getChorePromise(currentChore);
          result
            .then((value) => {
              DEBUG && debugTrace('execute.DONE', currentChore, choreQueue);
              currentChore!.$returnValue$ = value;
              currentChore!.$resolve$?.(value);

              scheduleBlockedChoresAndDrainIfNeeded(currentChore!);
            })
            .catch((e) => {
              currentChore!.$returnValue$ = null;
              currentChore!.$reject$?.(e);
              DEBUG && debugTrace('execute.ERROR', currentChore, choreQueue);
              container.handleError(e, currentChore!.$host$);
            })
            .finally(() => {
              currentChore!.$pending$ = false;
              runningChoresCount--;
              maybeFinishDrain();
            });
        } else {
          DEBUG && debugTrace('execute.DONE', currentChore, choreQueue);
          currentChore.$returnValue$ = result;
          scheduleBlockedChoresAndDrainIfNeeded(currentChore);
        }

        if (shouldApplyJournalFlush()) {
          applyJournalFlush();
          drainInNextTick();
          return;
        }
      }
    } catch (e) {
      DEBUG && debugTrace('execute.ERROR', currentChore, choreQueue);
      container.handleError(e, currentChore?.$host$ || null);
    } finally {
      maybeFinishDrain();
    }
  }

  function executeChore(chore: Chore, isServer: boolean): ValueOrPromise<unknown> {
    const host = chore.$host$;
    DEBUG && debugTrace('execute', chore, choreQueue);
    let returnValue: ValueOrPromise<unknown> | unknown = null;
    switch (chore.$type$) {
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
            (err: any) => {
              container.handleError(err, host);
            }
          );
        }
        break;
      case ChoreType.RUN_QRL:
        {
          const fn = (chore.$target$ as QRLInternal<(...args: unknown[]) => unknown>).getFn();
          returnValue = retryOnPromise(() => fn(...(chore.$payload$ as unknown[])));
        }
        break;
      case ChoreType.TASK:
      case ChoreType.VISIBLE:
        {
          const payload = chore.$payload$ as DescriptorBase;
          if (payload.$flags$ & TaskFlags.RESOURCE) {
            returnValue = runResource(payload as ResourceDescriptor<TaskFn>, container, host);
          } else {
            returnValue = runTask(payload as Task<TaskFn, TaskFn>, container, host);
          }
        }
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
          const target = chore.$target$ as
            | SignalImpl
            | ComputedSignalImpl<unknown>
            | WrappedSignalImpl<unknown>
            | StoreHandler;

          const effects = chore.$payload$ as Set<EffectSubscription>;
          if (!target.$effects$?.size) {
            break;
          }

          if (target instanceof AsyncComputedSignalImpl) {
            // TODO: it should be triggered only when value is changed only
            returnValue = retryOnPromise(() => {
              triggerEffects(container, target, effects);
            });
          } else if (target instanceof ComputedSignalImpl || target instanceof WrappedSignalImpl) {
            const forceRunEffects = target.$forceRunEffects$;
            target.$forceRunEffects$ = false;
            returnValue = retryOnPromise(() => {
              if (target.$computeIfNeeded$() || forceRunEffects) {
                triggerEffects(container, target, effects);
              }
            });
          } else {
            returnValue = retryOnPromise(() => {
              triggerEffects(container, target, effects);
            });
          }
        }
        break;
      }
    }
    return returnValue;
  }

  /**
   * Compares two chores to determine their execution order in the scheduler's queue.
   *
   * @param a - The first chore to compare
   * @param b - The second chore to compare
   * @param rootVNode
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
    if (existing.$payload$ !== value.$payload$) {
      existing.$payload$ = value.$payload$;
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
        [ChoreType.TASK]: 'TASK',
        [ChoreType.NODE_DIFF]: 'NODE_DIFF',
        [ChoreType.NODE_PROP]: 'NODE_PROP',
        [ChoreType.COMPONENT]: 'COMPONENT',
        [ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS]: 'RECOMPUTE_SIGNAL',
        [ChoreType.VISIBLE]: 'VISIBLE',
        [ChoreType.CLEANUP_VISIBLE]: 'CLEANUP_VISIBLE',
        [ChoreType.WAIT_FOR_QUEUE]: 'WAIT_FOR_QUEUE',
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

function debugTrace(action: string, arg?: any | null, queue?: Chore[]) {
  const lines = ['===========================\nScheduler: ' + action];
  if (arg && !('$type$' in arg)) {
    lines.push('      arg: ' + String(arg).replaceAll(/\n.*/gim, ''));
  } else if (arg && !queue?.length) {
    lines.push('      arg: ' + debugChoreToString(arg));
  }
  if (queue) {
    queue.forEach((chore) => {
      const active = chore === arg ? '>>>' : '   ';
      lines.push(
        `     ${active} > ` + (chore.$pending$ ? '[running] ' : '') + debugChoreToString(chore)
      );
    });
  }
  // eslint-disable-next-line no-console
  console.log(lines.join('\n') + '\n');
}
