/**
 * @file
 *
 *   Signals come in two types:
 *
 *   1. `Signal` - A storage of data
 *   2. `ComputedSignal` - A signal which is computed from other signals.
 *
 *   ## Why is `ComputedSignal` different?
 *
 *   - It needs to store a function which needs to re-run.
 *   - It is `Readonly` because it is computed.
 */

import { assertDefined, assertFalse, assertTrue } from '../../error/assert';
import type { QRLInternal } from '../../qrl/qrl-class';
import type { QRL } from '../../qrl/qrl.public';
import { SubscriptionType } from '../../state/common';
import { invoke, tryGetInvokeContext, type InvokeContext } from '../../use/use-core';
import { Task, isTask } from '../../use/use-task';
import { isPromise } from '../../util/promises';
import type { VNode } from '../client/types';
import { ChoreType } from '../shared/scheduler';
import type { Signal2 as ISignal2 } from './v2-signal.public';

const DEBUG = true;

/**
 * Special value used to mark that a given signal needs to be computed. This is essentially a
 * "marked as dirty" flag.
 */
const NEEDS_COMPUTATION: any = {
  __dirty__: true,
};

// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log(...args);

export const createSignal2 = (value?: any) => {
  return new Signal2(value, null);
};

// TODO(mhevery): this should not be a public API.
export const createComputedSignal2 = <T>(qrl: QRL<() => T>) => {
  const signal = new Signal2(NEEDS_COMPUTATION, qrl);
  signal.untrackedValue; // trigger computation
  return signal;
};

export const isSignal2 = (value: any): value is ISignal2<unknown> => {
  return value instanceof Signal2;
};

class Signal2<T = any> implements ISignal2<T> {
  private $untrackedValue$: T;

  /**
   * Store a list of effects which are dependent on this signal.
   *
   * An effect is work which needs to be done when the signal changes.
   *
   * 1. `Task` - A task which needs to be re-run.
   * 2. `VNode` - A component or Direct DOM update. (Look at the VNode attributes to determine if it is
   *    a Component or VNode signal target)
   */
  private $effects$: null | Array<Task | VNode | Signal2> = null;

  /** If this signal is computed, then compute function is stored here. */
  private $computeQrl$: null | QRLInternal<() => T>;
  private $context$: InvokeContext | undefined;

  constructor(value: T, computeTask: QRLInternal<() => T> | null) {
    this.$untrackedValue$ = value;
    this.$computeQrl$ = computeTask;
    this.$context$ = tryGetInvokeContext();
  }

  get untrackedValue() {
    let untrackedValue = this.$untrackedValue$;
    if (untrackedValue === NEEDS_COMPUTATION) {
      assertDefined(
        this.$computeQrl$,
        'Signal is marked as dirty, but no compute function is provided.'
      );
      const computeQrl = this.$computeQrl$!;
      const ctx = this.$context$;
      const computedFn = computeQrl.getFn(ctx);
      if (isPromise(computedFn)) {
        throw computedFn;
      } else {
        const previousSubscriber = ctx?.$subscriber$;
        try {
          ctx && (ctx.$subscriber$ = this as any);
          untrackedValue = (computedFn as () => T)();
        } finally {
          ctx && (ctx.$subscriber$ = previousSubscriber);
        }
        assertFalse(isPromise(untrackedValue), 'Computed function must be synchronous.');
        this.$untrackedValue$ = untrackedValue;
      }
    }
    assertFalse(untrackedValue === NEEDS_COMPUTATION, 'Signal is not computed.');
    return untrackedValue;
  }

  get value() {
    const ctx = tryGetInvokeContext();
    const subscriber = ctx?.$subscriber$;
    let target: Signal2 | Task;
    if (subscriber) {
      if (subscriber instanceof Signal2) {
        assertDefined(subscriber.$computeQrl$, 'Expecting ComputedSignal');
        // Special case of a computed signal.
        subscriber.$untrackedValue$ = NEEDS_COMPUTATION;
        const resolved = subscriber.$computeQrl$.getFn();
        // TODO(mhevery): This needs to be added to the scheduler to make sure
        // that we don't try to read the computed signal until it has been resolved.
        // scheduler(ChoreType.QRL_RESOLVE, resolved);
        target = subscriber;
        DEBUG && log('Should schedule', resolved);
      } else {
        target = subscriber[1] as Task;
        assertTrue(isTask(target), 'Invalid subscriber.');
      }
      const effects = this.$effects$ || (this.$effects$ = []);
      const existingIdx = effects.indexOf(target);
      if (existingIdx === -1) {
        DEBUG && log('Signal.subscribe', isSignal2(target) ? 'Signal2' : 'Task', target);
        this.$effects$?.push(target);
      }
    }
    return this.untrackedValue;
  }

  set value(value) {
    if (value !== this.untrackedValue) {
      DEBUG && log('Signal.set', this.untrackedValue, '->', value);
      this.$untrackedValue$ = value;
      if (this.$effects$ && this.$context$) {
        const scheduler = this.$context$.$container2$!.$scheduler$;
        const scheduleEffect = (effect: VNode | Task | Signal2) => {
          DEBUG && log('  effect', effect);
          if (isTask(effect)) {
            scheduler(ChoreType.TASK, effect);
          } else if (effect instanceof Signal2) {
            effect.$effects$?.forEach(scheduleEffect);
          } else {
            throw new Error('Not implemented');
          }
        };
        this.$effects$.forEach(scheduleEffect);
      }
    }
  }
}
