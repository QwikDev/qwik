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

import { type DomContainer } from '../client/dom-container';
import { VNodeFlags, type ClientContainer } from '../client/types';
import { VNodeJournalOpCode, vnode_isVNode } from '../client/vnode';
import { vnode_diff } from '../client/vnode-diff';
import { ComputedSignalImpl } from '../reactive-primitives/impl/computed-signal-impl';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import { isSignal, type Signal } from '../reactive-primitives/signal.public';
import type { NodePropPayload } from '../reactive-primitives/subscription-data';
import {
  SignalFlags,
  type AsyncComputeQRL,
  type ComputeQRL,
  type EffectSubscription,
  type StoreTarget,
} from '../reactive-primitives/types';
import { scheduleEffects } from '../reactive-primitives/utils';
import { type ISsrNode, type SSRContainer } from '../ssr/ssr-types';
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
import type { Props } from './jsx/jsx-runtime';
import type { JSXOutput } from './jsx/types/jsx-node';
import { isServerPlatform } from './platform/platform';
import { type QRLInternal } from './qrl/qrl-class';
import { SsrNodeFlags, type Container, type HostElement } from './types';
import { ChoreType } from './util-chore-type';
import { QScopedStyle } from './utils/markers';
import { isPromise, maybeThen, retryOnPromise, safeCall } from './utils/promises';
import { addComponentStylePrefix } from './utils/scoped-styles';
import { serializeAttribute } from './utils/styles';
import { type ValueOrPromise } from './utils/types';
import { invoke, newInvokeContext } from '../use/use-core';
import { findBlockingChore, findBlockingChoreForVisible } from './scheduler-rules';
import { createNextTick } from './platform/next-tick';
import { AsyncComputedSignalImpl } from '../reactive-primitives/impl/async-computed-signal-impl';
import { isSsrNode } from '../reactive-primitives/subscriber';
import { logWarn } from './utils/log';
import type { ElementVNode, VirtualVNode } from '../client/vnode-impl';
import { ChoreArray, choreComparator } from '../client/chore-array';

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
  $startTime$: number | undefined;
  $endTime$: number | undefined;

  $resolve$: ((value: any) => void) | undefined;
  $reject$: ((reason?: any) => void) | undefined;
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
  choreQueue: ChoreArray,
  blockedChores: Set<Chore>,
  runningChores: Set<Chore>
) => {
  let drainChore: Chore<ChoreType.WAIT_FOR_QUEUE> | null = null;
  let drainScheduled = false;
  let isDraining = false;
  let isJournalFlushRunning = false;
  let flushBudgetStart = 0;
  let currentTime = performance.now();
  const nextTick = createNextTick(drainChoreQueue);

  function drainInNextTick() {
    if (!drainScheduled) {
      drainScheduled = true;
      nextTick();
    }
  }
  // Drain for ~16.67ms, then apply journal flush for ~16.67ms, then repeat
  // We divide by 60 because we want to run at 60fps
  const FREQUENCY_MS = Math.floor(1000 / 60);

  return schedule;

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
    target: Signal<unknown> | StoreTarget,
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
    const chore: Chore<T> = {
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
      $startTime$: undefined,
      $endTime$: undefined,
      $resolve$: undefined,
      $reject$: undefined,
      $returnValue$: null!,
    };

    if (type === ChoreType.WAIT_FOR_QUEUE) {
      getChorePromise(chore);
      drainChore = chore as Chore<ChoreType.WAIT_FOR_QUEUE>;
      drainInNextTick();
      return chore;
    }

    const isServer = isServerPlatform();
    const isClientOnly = type === ChoreType.NODE_DIFF || type === ChoreType.QRL_RESOLVE;
    if (isServer && isClientOnly) {
      DEBUG &&
        debugTrace(
          `skip client chore ${debugChoreTypeToString(type)}`,
          chore,
          choreQueue,
          blockedChores
        );
      // Mark skipped client-only chores as completed on the server
      finishChore(chore, undefined);
      return chore;
    }

    if (isServer && chore.$host$ && isSsrNode(chore.$host$)) {
      const isUpdatable = !!(chore.$host$.flags & SsrNodeFlags.Updatable);

      if (!isUpdatable) {
        if (
          // backpatching exceptions:
          // - node prop is allowed because it is used to update the node property
          // - recompute and schedule effects because it triggers effects (so node prop too)
          chore.$type$ !== ChoreType.NODE_PROP &&
          chore.$type$ !== ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS
        ) {
          // We are running on the server.
          // On server we can't schedule task for a different host!
          // Server is SSR, and therefore scheduling for anything but the current host
          // implies that things need to be re-run and that is not supported because of streaming.
          const warningMessage = `A '${choreTypeToName(
            chore.$type$
          )}' chore was scheduled on a host element that has already been streamed to the client.
This can lead to inconsistencies between Server-Side Rendering (SSR) and Client-Side Rendering (CSR).

Problematic chore:
  - Type: ${choreTypeToName(chore.$type$)}
  - Host: ${chore.$host$.toString()}
  - Nearest element location: ${chore.$host$.currentFile}

This is often caused by modifying a signal in an already rendered component during SSR.`;
          logWarn(warningMessage);
          DEBUG &&
            debugTrace('schedule.SKIPPED host is not updatable', chore, choreQueue, blockedChores);
          return chore;
        }
      }
    }

    const blockingChore = findBlockingChore(
      chore,
      choreQueue,
      blockedChores,
      runningChores,
      container
    );
    if (blockingChore) {
      addBlockedChore(chore, blockingChore, blockedChores);
      return chore;
    }
    if (!isRunningChore(chore)) {
      const idx = choreQueue.add(chore);
      if (idx < 0 && vnode_isVNode(chore.$host$)) {
        (chore.$host$.chores ||= new ChoreArray()).add(chore);
      }
    }
    DEBUG && debugTrace('schedule', chore, choreQueue, blockedChores);

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

  ////////////////////////////////////////////////////////////////////////////////
  // Drain queue helpers
  ////////////////////////////////////////////////////////////////////////////////

  function applyJournalFlush() {
    if (!isJournalFlushRunning) {
      // prevent multiple journal flushes from running at the same time
      isJournalFlushRunning = true;
      journalFlush();
      isJournalFlushRunning = false;
      flushBudgetStart = performance.now();
      DEBUG && debugTrace('journalFlush.DONE', null, choreQueue, blockedChores);
    }
  }

  function shouldApplyJournalFlush(isServer: boolean) {
    return !isServer && currentTime - flushBudgetStart >= FREQUENCY_MS;
  }

  function drainChoreQueue(): void {
    const isServer = isServerPlatform();
    drainScheduled = false;
    if (isDraining) {
      return;
    }
    // early return if the queue is empty
    if (!choreQueue.length) {
      applyJournalFlush();
      if (drainChore && !runningChores.size) {
        // resolve drainChore only if there are no running chores, because
        // we are sure that we are done
        drainChore.$resolve$!(null);
        drainChore = null;
      }
      return;
    }
    isDraining = true;
    flushBudgetStart = performance.now();

    const maybeFinishDrain = () => {
      if (choreQueue.length) {
        drainInNextTick();
        return false;
      }
      if (drainChore && runningChores.size) {
        if (shouldApplyJournalFlush(isServer)) {
          // apply journal flush even if we are not finished draining the queue
          applyJournalFlush();
        }
        return false;
      }
      currentChore = null;
      applyJournalFlush();
      drainChore?.$resolve$!(null);
      drainChore = null;
      DEBUG && debugTrace('drain.DONE', drainChore, choreQueue, blockedChores);
      return true;
    };

    const scheduleBlockedChoresAndDrainIfNeeded = (chore: Chore) => {
      let blockedChoresScheduled = false;
      if (chore.$blockedChores$) {
        for (const blockedChore of chore.$blockedChores$) {
          const blockingChore = findBlockingChore(
            blockedChore,
            choreQueue,
            blockedChores,
            runningChores,
            container
          );
          if (blockingChore) {
            addBlockedChore(blockedChore, blockingChore, blockedChores);
          } else {
            blockedChores.delete(blockedChore);
            if (vnode_isVNode(blockedChore.$host$)) {
              blockedChore.$host$.blockedChores?.delete(blockedChore);
            }
            choreQueue.add(blockedChore);
            blockedChoresScheduled = true;
          }
        }
        chore.$blockedChores$ = null;
      }
      if (blockedChoresScheduled && !isDraining) {
        drainInNextTick();
      }
    };

    let currentChore: Chore | null = null;

    try {
      while (choreQueue.length) {
        currentTime = performance.now();
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
          DEBUG && debugTrace('skip chore', chore, choreQueue, blockedChores);
          if (vnode_isVNode(chore.$host$)) {
            chore.$host$.chores?.delete(chore);
          }
          continue;
        }

        if (chore.$type$ === ChoreType.VISIBLE) {
          // ensure that the journal flush is applied before the visible chore is executed
          // so that the visible chore can see the latest DOM changes
          applyJournalFlush();
          const blockingChore = findBlockingChoreForVisible(chore, runningChores, container);
          if (blockingChore && blockingChore.$state$ === ChoreState.RUNNING) {
            addBlockedChore(chore, blockingChore, blockedChores);
            continue;
          }
        }

        // Note that this never throws
        chore.$startTime$ = performance.now();
        const result = executeChore(chore, isServer);
        chore.$returnValue$ = result;
        if (isPromise(result)) {
          runningChores.add(chore);
          chore.$state$ = ChoreState.RUNNING;

          result
            .then((value) => {
              finishChore(chore, value);
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
              // If drainChore is not null, we are waiting for it to finish.
              // If there are no running chores, we can finish the drain.
              if (!runningChores.size) {
                let finished = false;
                if (drainChore) {
                  finished = maybeFinishDrain();
                }
                if (!finished && !isDraining) {
                  // if finished, then journal flush is already applied
                  applyJournalFlush();
                }
              }
            });
        } else {
          finishChore(chore, result);
          scheduleBlockedChoresAndDrainIfNeeded(chore);
        }

        if (shouldApplyJournalFlush(isServer)) {
          applyJournalFlush();
          drainInNextTick();
          return;
        }
      }
    } catch (e) {
      handleError(currentChore!, e);
      scheduleBlockedChoresAndDrainIfNeeded(currentChore!);
    } finally {
      isDraining = false;
      maybeFinishDrain();
    }
  }

  function finishChore(chore: Chore, value: any) {
    chore.$endTime$ = performance.now();
    chore.$state$ = ChoreState.DONE;
    chore.$returnValue$ = value;
    chore.$resolve$?.(value);
    if (vnode_isVNode(chore.$host$)) {
      chore.$host$.chores?.delete(chore);
    }
    DEBUG && debugTrace('execute.DONE', chore, choreQueue, blockedChores);
  }

  function handleError(chore: Chore, e: any) {
    chore.$endTime$ = performance.now();
    chore.$state$ = ChoreState.FAILED;
    DEBUG && debugTrace('execute.ERROR', chore, choreQueue, blockedChores);
    // If we used the result as promise, this won't exist
    chore.$reject$?.(e);
    container.handleError(e, chore.$host$);
  }

  function executeChore<T extends ChoreType>(
    chore: Chore<T>,
    isServer: boolean
  ): ValueOrPromise<ChoreReturnValue<T>> {
    const host = chore.$host$;
    DEBUG && debugTrace('execute', chore, choreQueue, blockedChores);
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
          if (isServer) {
            (container as SSRContainer).addBackpatchEntry(
              (chore.$host$ as ISsrNode).id,
              property,
              serializedValue
            );
            returnValue = null;
          } else {
            if (isConst) {
              const element = virtualNode.element;
              journal.push(VNodeJournalOpCode.SetAttribute, element, property, serializedValue);
            } else {
              virtualNode.setAttr(property, serializedValue, journal);
            }
            returnValue = undefined as ValueOrPromise<ChoreReturnValue<ChoreType.NODE_PROP>>;
          }
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
          const target = chore.$target$ as ComputedSignalImpl<unknown> | WrappedSignalImpl<unknown>;

          const effects = chore.$payload$ as Set<EffectSubscription>;
          if (!effects?.size) {
            break;
          }

          let shouldCompute =
            target instanceof ComputedSignalImpl || target instanceof WrappedSignalImpl;

          // for .error and .loading effects
          if (target instanceof AsyncComputedSignalImpl && effects !== target.$effects$) {
            shouldCompute = false;
          }

          if (shouldCompute) {
            const ctx = newInvokeContext();
            ctx.$container$ = container;
            // needed for computed signals and throwing QRLs
            returnValue = maybeThen(
              retryOnPromise(() =>
                invoke.call(target, ctx, (target as ComputedSignalImpl<unknown>).$computeIfNeeded$)
              ),
              () => {
                if ((target as ComputedSignalImpl<unknown>).$flags$ & SignalFlags.RUN_EFFECTS) {
                  (target as ComputedSignalImpl<unknown>).$flags$ &= ~SignalFlags.RUN_EFFECTS;
                  return retryOnPromise(() => scheduleEffects(container, target, effects));
                }
              }
            ) as ValueOrPromise<ChoreReturnValue<ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS>>;
          } else {
            returnValue = retryOnPromise(() => {
              scheduleEffects(container, target, effects);
            }) as ValueOrPromise<ChoreReturnValue<ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS>>;
          }
        }
        break;
      }
    }
    return returnValue as any;
  }

  function isRunningChore(chore: Chore): boolean {
    if (runningChores.size) {
      // 1.1. Check if the chore is already running.
      for (const runningChore of runningChores) {
        const comp = choreComparator(chore, runningChore);
        if (comp === 0) {
          return true;
        }
      }
    }
    return false;
  }
};

function vNodeAlreadyDeleted(chore: Chore): boolean {
  return !!(chore.$host$ && vnode_isVNode(chore.$host$) && chore.$host$.flags & VNodeFlags.Deleted);
}

export function addBlockedChore(
  blockedChore: Chore,
  blockingChore: Chore,
  blockedChores: Set<Chore>
) {
  DEBUG &&
    debugTrace(
      `blocked chore by ${debugChoreToString(blockingChore)}`,
      blockedChore,
      undefined,
      blockedChores
    );
  blockingChore.$blockedChores$ ||= [];
  blockingChore.$blockedChores$.push(blockedChore);
  blockedChores.add(blockedChore);
  if (vnode_isVNode(blockedChore.$host$)) {
    (blockedChore.$host$.blockedChores ||= new ChoreArray()).add(blockedChore);
  }
}

function choreTypeToName(type: ChoreType): string {
  return (
    (
      {
        [ChoreType.QRL_RESOLVE]: 'Resolve QRL',
        [ChoreType.RUN_QRL]: 'Run QRL',
        [ChoreType.TASK]: 'Task',
        [ChoreType.NODE_DIFF]: 'Changes diffing',
        [ChoreType.NODE_PROP]: 'Updating node property',
        [ChoreType.COMPONENT]: 'Component',
        [ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS]: 'Signal recompute',
        [ChoreType.VISIBLE]: 'Visible',
        [ChoreType.CLEANUP_VISIBLE]: 'Cleanup visible',
        [ChoreType.WAIT_FOR_QUEUE]: 'Wait for queue',
      } as Record<ChoreType, string>
    )[type] || 'Unknown: ' + type
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

function debugTrace(
  action: string,
  arg?: any | null,
  queue?: ChoreArray,
  blockedChores?: Set<Chore>
) {
  const lines: string[] = [];

  // Header
  lines.push(`Scheduler: ${action}`);

  // Argument section
  if (arg) {
    lines.push('');
    if (arg && '$type$' in arg) {
      const chore = arg as Chore;
      const type = debugChoreTypeToString(chore.$type$);
      const host = String(chore.$host$).replaceAll(/\n.*/gim, '');
      const qrlTarget = (chore.$target$ as QRLInternal<any>)?.$symbol$;
      const targetOrHost =
        chore.$type$ === ChoreType.QRL_RESOLVE || chore.$type$ === ChoreType.RUN_QRL
          ? qrlTarget
          : host;

      lines.push(`🎯 Current Chore:`);
      lines.push(`  Type: ${type}`);
      lines.push(`  Host: ${targetOrHost}`);

      // Show execution time if available
      if (chore.$startTime$ && chore.$endTime$) {
        const executionTime = chore.$endTime$ - chore.$startTime$;
        lines.push(`  Time: ${executionTime.toFixed(2)}ms`);
      } else if (chore.$startTime$) {
        const elapsedTime = performance.now() - chore.$startTime$;
        lines.push(`  Time: ${elapsedTime.toFixed(2)}ms (running)`);
      }

      // Show blocked chores for this chore
      if (chore.$blockedChores$ && chore.$blockedChores$.length > 0) {
        lines.push(`  ⛔ Blocked Chores:`);
        chore.$blockedChores$.forEach((blockedChore, index) => {
          const blockedType = debugChoreTypeToString(blockedChore.$type$);
          const blockedTarget = String(blockedChore.$host$).replaceAll(/\n.*/gim, '');
          lines.push(`    ${index + 1}. ${blockedType} ${blockedTarget} ${blockedChore.$idx$}`);
        });
      }
    } else {
      lines.push(`📝 Argument: ${String(arg).replaceAll(/\n.*/gim, '')}`);
    }
  }

  // Queue section
  if (queue && queue.length > 0) {
    lines.push('');
    lines.push(`📋 Queue (${queue.length} items):`);

    for (let i = 0; i < queue.length; i++) {
      const chore = queue[i];
      const isActive = chore === arg;
      const activeMarker = isActive ? `▶ ` : '  ';
      const type = debugChoreTypeToString(chore.$type$);
      const state = chore.$state$ ? `[${ChoreState[chore.$state$]}]` : '';
      const host = String(chore.$host$).replaceAll(/\n.*/gim, '');
      const qrlTarget = (chore.$target$ as QRLInternal<any>)?.$symbol$;
      const target =
        chore.$type$ === ChoreType.QRL_RESOLVE || chore.$type$ === ChoreType.RUN_QRL
          ? qrlTarget
          : host;
      const line = `${activeMarker}${state} ${type} ${target} ${chore.$idx$}`;
      lines.push(line);
    }
  }

  // Blocked chores section
  if (blockedChores && blockedChores.size > 0) {
    lines.push('');
    lines.push(`🚫 Blocked Chores (${blockedChores.size} items):`);

    Array.from(blockedChores).forEach((chore, index) => {
      const type = debugChoreTypeToString(chore.$type$);
      const host = String(chore.$host$).replaceAll(/\n.*/gim, '');
      const qrlTarget = (chore.$target$ as QRLInternal<any>)?.$symbol$;
      const target =
        chore.$type$ === ChoreType.QRL_RESOLVE || chore.$type$ === ChoreType.RUN_QRL
          ? qrlTarget
          : host;

      lines.push(`  ${index + 1}. ${type} ${target} ${chore.$idx$}`);
    });
  }

  // Footer
  lines.push('');
  lines.push('─'.repeat(60));

  // eslint-disable-next-line no-console
  console.log(lines.join('\n') + '\n');
}
