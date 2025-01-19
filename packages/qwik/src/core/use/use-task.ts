import { getDomContainer } from '../client/dom-container';
import type { VNode } from '../client/types';
import { isServerPlatform } from '../shared/platform/platform';
import { assertQrl, createQRL, type QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { ChoreType } from '../shared/scheduler';
import { type Container, type HostElement } from '../shared/types';
import { logError } from '../shared/utils/log';
import { TaskEvent } from '../shared/utils/markers';
import { isPromise, safeCall } from '../shared/utils/promises';
import { noSerialize, type NoSerialize } from '../shared/utils/serialize-utils';
import { isFunction, type ValueOrPromise } from '../shared/utils/types';
import { EffectProperty, isSignal } from '../signal/signal';
import { Subscriber, clearSubscriberEffectDependencies } from '../signal/signal-subscriber';
import { type Signal } from '../signal/signal.public';
import { invoke, newInvokeContext } from './use-core';
import { useLexicalScope } from './use-lexical-scope.public';
import { useOn, useOnDocument } from './use-on';
import type { ResourceReturnInternal } from './use-resource';
import { useSequentialScope } from './use-sequential-scope';
import type { VisibleTaskStrategy } from './use-visible-task';

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
  cleanup(callback: () => void): void;
}

/** @public */
export type TaskFn = (ctx: TaskCtx) => ValueOrPromise<void | (() => void)>;

/** @public */
export interface DescriptorBase<T = unknown, B = unknown> extends Subscriber {
  $flags$: number;
  $index$: number;
  $el$: HostElement;
  $qrl$: QRLInternal<T>;
  $state$: B | undefined;
  $destroy$: NoSerialize<() => void> | null;
}

/** @public */
export type EagernessOptions = 'visible' | 'load' | 'idle';

/** @public */
export interface UseTaskOptions {
  /**
   * - `visible`: run the effect when the element is visible.
   * - `load`: eagerly run the effect when the application resumes.
   */
  eagerness?: EagernessOptions;
}

/** @internal */
export const useTaskQrl = (qrl: QRL<TaskFn>, opts?: UseTaskOptions): void => {
  const { val, set, iCtx, i } = useSequentialScope<1 | Task>();
  if (val) {
    return;
  }
  assertQrl(qrl);
  set(1);

  const host = iCtx.$hostElement$ as unknown as HostElement;
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
  const result = runTask(task, iCtx.$container$, host);
  if (isPromise(result)) {
    throw result;
  }
  qrl.$resolveLazy$(iCtx.$element$);
  if (isServerPlatform()) {
    useRunTask(task, opts?.eagerness);
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
  const taskFn = task.$qrl$.getFn(iCtx, () =>
    clearSubscriberEffectDependencies(container, task)
  ) as TaskFn;

  const track: Tracker = (obj: (() => unknown) | object | Signal<unknown>, prop?: string) => {
    const ctx = newInvokeContext();
    ctx.$effectSubscriber$ = [task, EffectProperty.COMPONENT];
    ctx.$container$ = container;
    return invoke(ctx, () => {
      if (isFunction(obj)) {
        return obj();
      }
      if (prop) {
        return (obj as Record<string, unknown>)[prop];
      } else if (isSignal(obj)) {
        return obj.value;
      } else {
        return obj;
      }
    });
  };
  const handleError = (reason: unknown) => container.handleError(reason, host);
  let cleanupFns: (() => void)[] | null = null;
  const cleanup = (fn: () => void) => {
    if (typeof fn == 'function') {
      if (!cleanupFns) {
        cleanupFns = [];
        task.$destroy$ = noSerialize(() => {
          task.$destroy$ = null;
          cleanupFns!.forEach((fn) => {
            try {
              fn();
            } catch (err) {
              handleError(err);
            }
          });
        });
      }
      cleanupFns.push(fn);
    }
  };

  const taskApi: TaskCtx = { track, cleanup };
  const result: ValueOrPromise<void> = safeCall(
    () => taskFn(taskApi),
    cleanup,
    (err: unknown) => {
      if (isPromise(err)) {
        return err.then(() => runTask(task, container, host));
      } else {
        return handleError(err);
      }
    }
  );
  return result;
};

export type TaskDescriptor = DescriptorBase<TaskFn>;

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

export const useRunTask = (
  task: Task,
  eagerness: VisibleTaskStrategy | EagernessOptions | undefined
) => {
  if (eagerness === 'visible' || eagerness === 'intersection-observer') {
    useOn('qvisible', getTaskHandlerQrl(task));
  } else if (eagerness === 'load' || eagerness === 'document-ready') {
    useOnDocument('qinit', getTaskHandlerQrl(task));
  } else if (eagerness === 'idle' || eagerness === 'document-idle') {
    useOnDocument('qidle', getTaskHandlerQrl(task));
  }
};

const getTaskHandlerQrl = (task: Task): QRL<(ev: Event) => void> => {
  const taskHandler = createQRL<(ev: Event) => void>(null, '_task', scheduleTask, null, null, [
    task,
  ]);
  return taskHandler;
};

export class Task<T = unknown, B = T>
  extends Subscriber
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

export const isTask = (value: any): value is Task => {
  return value instanceof Task;
};

/**
 * Low-level API used by the Optimizer to process `useTask$()` API. This method is not intended to
 * be used by developers.
 *
 * @internal
 */
export const scheduleTask = () => {
  const [task] = useLexicalScope<[Task]>();
  const container = getDomContainer(task.$el$ as VNode);
  const type = task.$flags$ & TaskFlags.VISIBLE_TASK ? ChoreType.VISIBLE : ChoreType.TASK;
  container.$scheduler$(type, task);
};
