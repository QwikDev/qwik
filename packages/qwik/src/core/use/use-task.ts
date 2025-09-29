import { getDomContainer } from '../client/dom-container';
import { BackRef, clearAllEffects } from '../reactive-primitives/cleanup';
import { type Signal } from '../reactive-primitives/signal.public';
import { type QRLInternal } from '../shared/qrl/qrl-class';
import { assertQrl } from '../shared/qrl/qrl-utils';
import type { QRL } from '../shared/qrl/qrl.public';
import { type Container, type HostElement } from '../shared/types';
import { ChoreType } from '../shared/util-chore-type';
import { logError } from '../shared/utils/log';
import { TaskEvent } from '../shared/utils/markers';
import { isPromise, safeCall } from '../shared/utils/promises';
import { type NoSerialize } from '../shared/utils/serialize-utils';
import { type ValueOrPromise } from '../shared/utils/types';
import { newInvokeContext } from './use-core';
import { useLexicalScope } from './use-lexical-scope.public';
import type { ResourceReturnInternal } from './use-resource';
import { useSequentialScope } from './use-sequential-scope';
import { cleanupFn, trackFn } from './utils/tracker';

export const enum TaskFlags {
  VISIBLE_TASK = 1 << 0,
  TASK = 1 << 1,
  RESOURCE = 1 << 2,
  DIRTY = 1 << 3,
}

// <docs markdown="../readme.md#Tracker">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#Tracker instead and run `pnpm docs.sync`)
/**
 * Used to signal to Qwik which state should be watched for changes.
 *
 * The `Tracker` is passed into the `taskFn` of `useTask`. It is intended to be used to wrap state
 * objects in a read proxy which signals to Qwik which properties should be watched for changes. A
 * change to any of the properties causes the `taskFn` to rerun.
 *
 * ### Example
 *
 * The `obs` passed into the `taskFn` is used to mark `state.count` as a property of interest. Any
 * changes to the `state.count` property will cause the `taskFn` to rerun.
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const store = useStore({ count: 0, doubleCount: 0 });
 *   const signal = useSignal(0);
 *   useTask$(({ track }) => {
 *     // Any signals or stores accessed inside the task will be tracked
 *     const count = track(() => store.count);
 *     // You can also pass a signal to track() directly
 *     const signalCount = track(signal);
 *     store.doubleCount = count + signalCount;
 *   });
 *   return (
 *     <div>
 *       <span>
 *         {store.count} / {store.doubleCount}
 *       </span>
 *       <button
 *         onClick$={() => {
 *           store.count++;
 *           signal.value++;
 *         }}
 *       >
 *         +
 *       </button>
 *     </div>
 *   );
 * });
 * ```
 *
 * @public
 * @see `useTask`
 */
// </docs>
export interface Tracker {
  /**
   * Include the expression using stores / signals to track:
   *
   * ```tsx
   * track(() => store.count);
   * ```
   *
   * The `track()` function also returns the value of the scoped expression:
   *
   * ```tsx
   * const count = track(() => store.count);
   * ```
   */
  <T>(fn: () => T): T;

  /**
   * Used to track the whole object. If any property of the passed store changes, the task will be
   * scheduled to run. Also accepts signals.
   *
   * Note that the change tracking is not deep. If you want to track changes to nested properties,
   * you need to use `track` on each of them.
   *
   * ```tsx
   * track(store); // returns store
   * track(signal); // returns signal.value
   * ```
   */
  <T extends object>(obj: T): T extends Signal<infer U> ? U : T;

  /**
   * Used to track to track a specific property of an object.
   *
   * Note that the change tracking is not deep. If you want to track changes to nested properties,
   * you need to use `track` on each of them.
   *
   * ```tsx
   * track(store, 'propA'); // returns store.propA
   * ```
   */
  <T extends object, P extends keyof T>(obj: T, prop: P): T[P];
}

/** @public */
export interface TaskCtx {
  track: Tracker;
  cleanup: (callback: () => void) => void;
}

/** @public */
export type TaskFn = (ctx: TaskCtx) => ValueOrPromise<void | (() => void)>;

/** @public */
export interface DescriptorBase<T = unknown, B = unknown> extends BackRef {
  $flags$: number;
  $index$: number;
  $el$: HostElement;
  $qrl$: QRLInternal<T>;
  $state$: B | undefined;
  $destroy$: NoSerialize<() => void> | null;
}

/** @internal */
export const useTaskQrl = (qrl: QRL<TaskFn>): void => {
  const { val, set, iCtx, i } = useSequentialScope<1 | Task>();
  if (val) {
    return;
  }
  assertQrl(qrl);
  set(1);

  const task = new Task(
    TaskFlags.DIRTY | TaskFlags.TASK,
    i,
    iCtx.$hostElement$,
    qrl,
    undefined,
    null
  );
  // In V2 we add the task to the sequential scope. We need to do this
  // in order to be able to retrieve it later when the parent element is
  // deleted and we need to be able to release the task subscriptions.
  set(task);
  const container = iCtx.$container$;
  const result = runTask(task, container, iCtx.$hostElement$);
  if (isPromise(result)) {
    throw result;
  }
};

export const runTask = (
  task: Task,
  container: Container,
  host: HostElement
): ValueOrPromise<void> => {
  task.$flags$ &= ~TaskFlags.DIRTY;
  cleanupTask(task);
  const iCtx = newInvokeContext(container.$locale$, host, undefined, TaskEvent);
  iCtx.$container$ = container;
  const taskFn = task.$qrl$.getFn(iCtx, () => clearAllEffects(container, task)) as TaskFn;

  const track = trackFn(task, container);
  const [cleanup] = cleanupFn(task, (reason: unknown) => container.handleError(reason, host));

  const taskApi: TaskCtx = { track, cleanup };
  return safeCall(
    () => taskFn(taskApi),
    cleanup,
    (err: unknown) => {
      // If a Promise is thrown, that means we need to re-run the task.
      if (isPromise(err)) {
        return err.then(() => runTask(task, container, host));
      } else {
        throw err;
      }
    }
  );
};

export const cleanupTask = (task: Task) => {
  const destroy = task.$destroy$;
  if (destroy) {
    task.$destroy$ = null;
    try {
      destroy();
    } catch (err) {
      logError(err);
    }
  }
};

export class Task<T = unknown, B = T>
  extends BackRef
  implements DescriptorBase<unknown, Signal<B> | ResourceReturnInternal<B>>
{
  constructor(
    public $flags$: number,
    public $index$: number,
    public $el$: HostElement,
    public $qrl$: QRLInternal<T>,
    public $state$: Signal<B> | ResourceReturnInternal<B> | undefined,
    public $destroy$: NoSerialize<() => void> | null
  ) {
    super();
  }
}
/** @internal */
export const isTask = (value: any): value is Task => {
  return value instanceof Task;
};

/**
 * Used internally as a qrl event handler to schedule a task.
 *
 * @internal
 */
export const scheduleTask = (_event: Event, element: Element) => {
  const [task] = useLexicalScope<[Task]>();
  const type = task.$flags$ & TaskFlags.VISIBLE_TASK ? ChoreType.VISIBLE : ChoreType.TASK;
  const container = getDomContainer(element);
  container.$scheduler$(type, task);
};
