import { qwikDebugToString } from '../../debug';
import { QError, qError } from '../../shared/error/error';
import type { Container } from '../../shared/types';
import { ChoreType } from '../../shared/util-chore-type';
import { isPromise } from '../../shared/utils/promises';
import { invoke, newInvokeContext } from '../../use/use-core';
import { isSignal, throwIfQRLNotResolved } from '../utils';
import type { BackRef } from '../cleanup';
import { getSubscriber } from '../subscriber';
import type { AsyncComputeQRL, EffectSubscription } from '../types';
import { _EFFECT_BACK_REF, EffectProperty, SignalFlags, STORE_ALL_PROPS } from '../types';
import { addStoreEffect, getStoreHandler, getStoreTarget, isStore } from './store';
import type { Signal } from '../signal.public';
import { isFunction } from '../../shared/utils/types';
import { ComputedSignalImpl } from './computed-signal-impl';
import { setupSignalValueAccess } from './signal-impl';
import { isDev } from '@qwik.dev/core/build';

const DEBUG = false;
const log = (...args: any[]) =>
  // eslint-disable-next-line no-console
  console.log('ASYNC COMPUTED SIGNAL', ...args.map(qwikDebugToString));

export class AsyncComputedSignalImpl<T>
  extends ComputedSignalImpl<T, AsyncComputeQRL<T>>
  implements BackRef
{
  $untrackedPending$: boolean = false;
  $untrackedError$: Error | null = null;

  $pendingEffects$: null | Set<EffectSubscription> = null;
  $errorEffects$: null | Set<EffectSubscription> = null;
  private $promiseValue$: T | null = null;

  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | null = null;

  constructor(container: Container | null, fn: AsyncComputeQRL<T>, flags = SignalFlags.INVALID) {
    super(container, fn, flags);
  }

  get pending(): boolean {
    return setupSignalValueAccess(
      this,
      () => (this.$pendingEffects$ ||= new Set()),
      () => this.untrackedPending
    );
  }

  set untrackedPending(value: boolean) {
    if (value !== this.$untrackedPending$) {
      this.$untrackedPending$ = value;
      this.$container$?.$scheduler$(
        ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
        null,
        this,
        this.$pendingEffects$
      );
    }
  }

  get untrackedPending() {
    return this.$untrackedPending$;
  }

  get error(): Error | null {
    return setupSignalValueAccess(
      this,
      () => (this.$errorEffects$ ||= new Set()),
      () => this.untrackedError
    );
  }

  set untrackedError(value: Error | null) {
    if (value !== this.$untrackedError$) {
      this.$untrackedError$ = value;
      this.$container$?.$scheduler$(
        ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS,
        null,
        this,
        this.$errorEffects$
      );
    }
  }

  get untrackedError() {
    return this.$untrackedError$;
  }

  $computeIfNeeded$() {
    if (!(this.$flags$ & SignalFlags.INVALID)) {
      return false;
    }
    const computeQrl = this.$computeQrl$;
    throwIfQRLNotResolved(computeQrl);

    const untrackedValue =
      this.$promiseValue$ ?? (computeQrl.getFn()({ track: this.$trackFn$.bind(this) }) as T);
    if (isPromise(untrackedValue)) {
      this.untrackedPending = true;
      this.untrackedError = null;
      throw untrackedValue
        .then((promiseValue) => {
          this.$promiseValue$ = promiseValue;
          this.untrackedPending = false;
        })
        .catch((err) => {
          if (isDev) {
            console.error(err);
          }
          this.untrackedError = err;
        });
    }
    this.$promiseValue$ = null;
    DEBUG && log('Signal.$asyncCompute$', untrackedValue);

    this.$flags$ &= ~SignalFlags.INVALID;

    const didChange = untrackedValue !== this.$untrackedValue$;
    if (didChange) {
      this.$untrackedValue$ = untrackedValue;
    }
    return didChange;
  }

  private $trackFn$(obj: (() => unknown) | object | Signal<unknown>, prop?: string) {
    const ctx = newInvokeContext();
    ctx.$effectSubscriber$ = getSubscriber(this, EffectProperty.VNODE);
    ctx.$container$ = this.$container$ || undefined;
    return invoke(ctx, () => {
      if (isFunction(obj)) {
        return obj();
      }
      if (prop) {
        return (obj as Record<string, unknown>)[prop];
      } else if (isSignal(obj)) {
        return obj.value;
      } else if (isStore(obj)) {
        // track whole store
        addStoreEffect(
          getStoreTarget(obj)!,
          STORE_ALL_PROPS,
          getStoreHandler(obj)!,
          ctx.$effectSubscriber$!
        );
        return obj;
      } else {
        throw qError(QError.trackObjectWithoutProp);
      }
    });
  }
}
