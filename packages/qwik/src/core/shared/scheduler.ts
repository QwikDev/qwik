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
import { AsyncComputedSignalImpl } from '../reactive-primitives/impl/async-computed-signal-impl';
import { ComputedSignalImpl } from '../reactive-primitives/impl/computed-signal-impl';
import { SignalImpl } from '../reactive-primitives/impl/signal-impl';
import { StoreHandler } from '../reactive-primitives/impl/store';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import { isSignal, type Signal } from '../reactive-primitives/signal.public';
import type { NodePropPayload } from '../reactive-primitives/subscription-data';
import {
  type AsyncComputeQRL,
  type ComputeQRL,
  type EffectSubscription,
  type StoreTarget,
} from '../reactive-primitives/types';
import { triggerEffects } from '../reactive-primitives/utils';
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
import { executeComponent } from './component-execution';
import type { OnRenderFn } from './component.public';
import { assertFalse } from './error/assert';
import type { Props } from './jsx/jsx-runtime';
import type { JSXOutput } from './jsx/types/jsx-node';
import { getPlatform, isServerPlatform } from './platform/platform';
import { type QRLInternal } from './qrl/qrl-class';
import { isQrl } from './qrl/qrl-utils';
import { ssrNodeDocumentPosition, vnode_documentPosition } from './scheduler-document-position';
import type { Container, HostElement } from './types';
import { ChoreType } from './util-chore-type';
import { logWarn } from './utils/log';
import { QScopedStyle } from './utils/markers';
import { isPromise, maybeThen, retryOnPromise, safeCall } from './utils/promises';
import { addComponentStylePrefix } from './utils/scoped-styles';
import { serializeAttribute } from './utils/styles';
import { type ValueOrPromise } from './utils/types';
import { invoke, newInvokeContext } from '../use/use-core';
import { addBlockedChore, findBlockingChore, findBlockingChoreForVisible } from './scheduler-rules';

// Turn this on to get debug output of what the scheduler is doing.
const DEBUG: boolean = false;

enum ChoreState {
  NONE = 0,
  RUNNING = 1,
  FAILED = 2,
  DONE = 3,
}

type ChoreReturnValue<T extends ChoreType = ChoreType> = T extends
  | ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS
  | ChoreType.WAIT_FOR_QUEUE
  | ChoreType.NODE_PROP
  ? void
  : T extends ChoreType.NODE_DIFF | ChoreType.COMPONENT
    ? JSXOutput
    : unknown;

export interface Chore<T extends ChoreType = ChoreType> {
  $type$: T;
  $idx$: number | string;
  $host$: HostElement;
  $target$: ChoreTarget | null;
  $payload$: unknown;
  $state$: ChoreState;
  $blockedChores$: Chore[] | null;

  $resolve$?: (value: any) => void;
  $reject$?: (reason?: any) => void;
  $returnValue$: ValueOrPromise<ChoreReturnValue<T>>;
}

export type Scheduler = ReturnType<typeof createScheduler>;

type ChoreTarget =
  | HostElement
  | QRLInternal<(...args: unknown[]) => unknown>
  | Signal
  | StoreTarget;

export const getChorePromise = <T extends ChoreType>(chore: Chore<T>) =>
  chore.$state$ === ChoreState.NONE
    ? (chore.$returnValue$ ||= new Promise((resolve, reject) => {
        chore.$resolve$ = resolve;
        chore.$reject$ = reject;
      }))
    : chore.$returnValue$;

export const createScheduler = (
  container: Container,
  journalFlush: () => void,
  choreQueue: Chore[] = [],
  blockedChores: Set<Chore> = new Set(),
  runningChores: Set<Chore> = new Set()
) => {
  let drainChore: Chore<ChoreType.WAIT_FOR_QUEUE> | null = null;
  let drainScheduled = false;
  let isDraining = false;
  let isJournalFlushRunning = false;

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
  ): Chore<ChoreType.QRL_RESOLVE>;
  function schedule(type: ChoreType.WAIT_FOR_QUEUE): Chore<ChoreType.WAIT_FOR_QUEUE>;
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
  ): Chore<ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS>;
  function schedule(
    type: ChoreType.TASK | ChoreType.VISIBLE,
    task: Task
  ): Chore<ChoreType.TASK | ChoreType.VISIBLE>;
  function schedule(
    type: ChoreType.RUN_QRL,
    host: HostElement,
    target: QRLInternal<(...args: unknown[]) => unknown>,
    args: unknown[]
  ): Chore<ChoreType.RUN_QRL>;
  function schedule(
    type: ChoreType.COMPONENT,
    host: HostElement,
    qrl: QRLInternal<OnRenderFn<unknown>>,
    props: Props | null
  ): Chore<ChoreType.COMPONENT>;
  function schedule(
    type: ChoreType.NODE_DIFF,
    host: HostElement,
    target: HostElement,
    value: JSXOutput | Signal
  ): Chore<ChoreType.NODE_DIFF>;
  function schedule(
    type: ChoreType.NODE_PROP,
    host: HostElement,
    prop: string,
    value: any
  ): Chore<ChoreType.NODE_PROP>;
  function schedule(type: ChoreType.CLEANUP_VISIBLE, task: Task): Chore<ChoreType.CLEANUP_VISIBLE>;
  ///// IMPLEMENTATION /////
  function schedule<T extends ChoreType>(
    type: T,
    hostOrTask: HostElement | Task | null = null,
    targetOrQrl: ChoreTarget | string | null = null,
    payload: any = null
  ): Chore<T> | null {
    if (type === ChoreType.WAIT_FOR_QUEUE && drainChore) {
      return drainChore as Chore<T>;
    }

    const isTask =
      type === ChoreType.TASK || type === ChoreType.VISIBLE || type === ChoreType.CLEANUP_VISIBLE;

    if (isTask) {
      (hostOrTask as Task).$flags$ |= TaskFlags.DIRTY;
    }
    let chore: Chore<T> = {
      $type$: type,
      $idx$: isTask
        ? (hostOrTask as Task).$index$
        : typeof targetOrQrl === 'string'
          ? targetOrQrl
          : 0,
      $host$: isTask ? (hostOrTask as Task).$el$ : (hostOrTask as HostElement),
      $target$: targetOrQrl as ChoreTarget | null,
      $payload$: isTask ? hostOrTask : payload,
      $state$: ChoreState.NONE,
      $blockedChores$: null,
      $returnValue$: null!,
    };

    if (type === ChoreType.WAIT_FOR_QUEUE) {
      getChorePromise(chore);
      drainChore = chore as Chore<ChoreType.WAIT_FOR_QUEUE>;
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

    const blockingChore = findBlockingChore(chore, choreQueue, blockedChores, container);
    if (blockingChore) {
      addBlockedChore(chore, blockingChore, blockedChores);
      return chore;
    }
    chore = sortedInsert(
      choreQueue,
      chore,
      (container as DomContainer).rootVNode || null
    ) as Chore<T>;
    DEBUG && debugTrace('schedule', chore, choreQueue);

    const runImmediately = (isServer && type === ChoreType.COMPONENT) || type === ChoreType.RUN_QRL;

    if (runImmediately && !isDraining) {
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
      if (!isJournalFlushRunning) {
        // prevent multiple journal flushes from running at the same time
        isJournalFlushRunning = true;
        journalFlush();
        isJournalFlushRunning = false;
        DEBUG && debugTrace('journalFlush.DONE', null, choreQueue);
      }
    };

    const maybeFinishDrain = () => {
      if (choreQueue.length) {
        return drainChoreQueue();
      }
      if (!drainScheduled) {
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
        for (const blockedChore of chore.$blockedChores$) {
          const blockingChore = findBlockingChore(
            blockedChore,
            choreQueue,
            blockedChores,
            container
          );
          if (blockingChore) {
            addBlockedChore(blockedChore, blockingChore, blockedChores);
          } else {
            blockedChores.delete(blockedChore);
            sortedInsert(choreQueue, blockedChore, (container as DomContainer).rootVNode || null);
          }
        }
        chore.$blockedChores$ = null;
      }
      drainInNextTick();
    };

    let currentChore: Chore | null = null;

    try {
      while (choreQueue.length) {
        now = performance.now();

        const chore = (currentChore = choreQueue.shift()!);
        if (chore.$state$ !== ChoreState.NONE) {
          continue;
        }

        if (
          vNodeAlreadyDeleted(chore) &&
          // we need to process cleanup tasks for deleted nodes
          chore.$type$ !== ChoreType.CLEANUP_VISIBLE
        ) {
          // skip deleted chore
          DEBUG && debugTrace('skip chore', chore, choreQueue);
          continue;
        }

        if (chore.$type$ === ChoreType.VISIBLE) {
          const blockingChore = findBlockingChoreForVisible(chore, runningChores, container);
          if (blockingChore && blockingChore.$state$ === ChoreState.RUNNING) {
            addBlockedChore(chore, blockingChore, blockedChores);
            continue;
          }
        }

        // Note that this never throws
        const result = executeChore(chore, isServer);
        chore.$returnValue$ = result;
        if (isPromise(result)) {
          runningChores.add(chore);
          chore.$state$ = ChoreState.RUNNING;

          result
            .then((value) => {
              chore.$returnValue$ = value;
              chore.$state$ = ChoreState.DONE;
              DEBUG && debugTrace('execute.DONE', chore, choreQueue);
              // If we used the result as promise, this won't exist
              chore.$resolve$?.(value);
            })
            .catch((e) => {
              if (chore.$state$ !== ChoreState.RUNNING) {
                // we already handled the error
                return;
              }
              handleError(chore, e);
            })
            .finally(() => {
              runningChores.delete(chore);
              // Note that we ignore failed chores so the app keeps working
              // TODO decide if this is ok and document it
              scheduleBlockedChoresAndDrainIfNeeded(chore);
              if (drainChore && !runningChores.size) {
                maybeFinishDrain();
              }
            });
        } else {
          DEBUG && debugTrace('execute.DONE', chore, choreQueue);
          chore.$state$ = ChoreState.DONE;
          chore.$resolve$?.(result);
          scheduleBlockedChoresAndDrainIfNeeded(chore);
        }

        if (shouldApplyJournalFlush()) {
          applyJournalFlush();
          drainInNextTick();
          return;
        }
      }
    } catch (e) {
      DEBUG && debugTrace('execute.ERROR sync', currentChore, choreQueue);
      container.handleError(e, currentChore?.$host$ || null);
      scheduleBlockedChoresAndDrainIfNeeded(currentChore!);
    } finally {
      maybeFinishDrain();
    }
  }

  function handleError(chore: Chore, e: any) {
    chore.$state$ = ChoreState.FAILED;
    DEBUG && debugTrace('execute.ERROR', chore, choreQueue);
    // If we used the result as promise, this won't exist
    chore.$reject$?.(e);
    container.handleError(e, chore.$host$);
  }

  function executeChore<T extends ChoreType>(
    chore: Chore<T>,
    isServer: boolean
  ): ValueOrPromise<ChoreReturnValue<T>> {
    const host = chore.$host$;
    DEBUG && debugTrace('execute', chore, choreQueue);
    let returnValue: ValueOrPromise<ChoreReturnValue<ChoreType>>;
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
              handleError(chore, err);
            }
          ) as ValueOrPromise<ChoreReturnValue<ChoreType.COMPONENT>>;
        }
        break;
      case ChoreType.RUN_QRL:
        {
          const fn = (chore.$target$ as QRLInternal<(...args: unknown[]) => unknown>).getFn();
          returnValue = retryOnPromise(() =>
            fn(...(chore.$payload$ as unknown[]))
          ) as ValueOrPromise<ChoreReturnValue<ChoreType.RUN_QRL>>;
        }
        break;
      case ChoreType.TASK:
      case ChoreType.VISIBLE:
        {
          const payload = chore.$payload$ as DescriptorBase;
          if (payload.$flags$ & TaskFlags.RESOURCE) {
            returnValue = runResource(
              payload as ResourceDescriptor<TaskFn>,
              container,
              host
            ) as ValueOrPromise<ChoreReturnValue<ChoreType.TASK>>;
          } else {
            returnValue = runTask(
              payload as Task<TaskFn, TaskFn>,
              container,
              host
            ) as ValueOrPromise<ChoreReturnValue<ChoreType.TASK>>;
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
          ) as ValueOrPromise<ChoreReturnValue<ChoreType.NODE_DIFF>>;
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
          returnValue = undefined as ValueOrPromise<ChoreReturnValue<ChoreType.NODE_PROP>>;
        }
        break;
      case ChoreType.QRL_RESOLVE: {
        {
          const target = chore.$target$ as QRLInternal<any>;
          returnValue = (!target.resolved ? target.resolve() : null) as ValueOrPromise<
            ChoreReturnValue<ChoreType.QRL_RESOLVE>
          >;
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
            }) as ValueOrPromise<ChoreReturnValue<ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS>>;
          } else if (target instanceof ComputedSignalImpl || target instanceof WrappedSignalImpl) {
            const forceRunEffects = target.$forceRunEffects$;
            target.$forceRunEffects$ = false;
            const ctx = newInvokeContext();
            ctx.$container$ = container;
            // needed for computed signals and throwing QRLs
            returnValue = maybeThen(
              retryOnPromise(() => invoke.call(target, ctx, target.$computeIfNeeded$)),
              (didChange) => {
                if (didChange || forceRunEffects) {
                  return retryOnPromise(() => triggerEffects(container, target, effects));
                }
              }
            ) as ValueOrPromise<ChoreReturnValue<ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS>>;
          } else {
            returnValue = retryOnPromise(() => {
              triggerEffects(container, target, effects);
            }) as ValueOrPromise<ChoreReturnValue<ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS>>;
          }
        }
        break;
      }
    }
    return returnValue as any;
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
    if (a.$target$ !== b.$target$) {
      if (isQrl(a.$target$) && isQrl(b.$target$) && a.$target$.$hash$ === b.$target$.$hash$) {
        return 0;
      }
      // 1 means that we are going to process chores as FIFO
      return 1;
    }

    // TODO: this is a hack to ensure that the effect chores are scheduled for the same target
    if (
      a.$type$ === ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS &&
      b.$type$ === ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS &&
      a.$target$ instanceof StoreHandler &&
      b.$target$ instanceof StoreHandler &&
      a.$payload$ !== b.$payload$
    ) {
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

    if (idx < 0 && runningChores.size) {
      // 1.1. Check if the chore is already running.
      for (const chore of runningChores) {
        const comp = choreComparator(value, chore, rootVNode);
        if (comp === 0) {
          return chore;
        }
      }
    }

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
  const state = chore.$state$ ? `[${ChoreState[chore.$state$]}] ` : '';
  const host = String(chore.$host$).replaceAll(/\n.*/gim, '');
  const qrlTarget = (chore.$target$ as QRLInternal<any>)?.$symbol$;
  return `${state}Chore(${type} ${chore.$type$ === ChoreType.QRL_RESOLVE || chore.$type$ === ChoreType.RUN_QRL ? qrlTarget : host} ${chore.$idx$})`;
}

function debugTrace(action: string, arg?: any | null, queue?: Chore[]) {
  const lines = ['===========================\nScheduler: ' + action];
  if (arg && '$type$' in arg) {
    lines.push('      arg: ' + debugChoreToString(arg));
  } else {
    lines.push('      arg: ' + String(arg).replaceAll(/\n.*/gim, ''));
  }
  if (queue) {
    queue.forEach((chore) => {
      const active = chore === arg ? '>>>' : '   ';
      lines.push(
        `     ${active} > ` + (chore.$state$ ? '[running] ' : '') + debugChoreToString(chore)
      );
    });
  }
  // eslint-disable-next-line no-console
  console.log(lines.join('\n') + '\n');
}
