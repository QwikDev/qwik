import { Signal } from './signal';
import { assertFalse } from '../shared/error/assert';
import { ChoreType } from '../shared/scheduler';
import type { Container } from '../shared/types';
import { NEEDS_COMPUTATION } from './flags';
import { triggerEffects } from './signal-effects';

export abstract class AbstractComputedSignal<T> extends Signal<T> {
  // We need a separate flag to know when the computation needs running because
  // we need the old value to know if effects need running after computation
  $invalid$: boolean = true;
  $forceRunEffects$: boolean = false;
  constructor(container: Container | null) {
    // The value is used for comparison when signals trigger, which can only happen
    // when it was calculated before. Therefore we can pass whatever we like.
    super(container, NEEDS_COMPUTATION);
  }

  $invalidate$() {
    this.$invalid$ = true;
    this.$forceRunEffects$ = false;
    this.$container$?.$scheduler$(ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS, null, this);
  }

  /**
   * Use this to force running subscribers, for example when the calculated value has mutated but
   * remained the same object
   */
  force() {
    this.$invalid$ = true;
    this.$forceRunEffects$ = false;
    triggerEffects(this.$container$, this, this.$effects$);
  }

  get untrackedValue() {
    const didChange = this.$computeIfNeeded$();
    if (didChange) {
      this.$forceRunEffects$ = didChange;
    }
    assertFalse(this.$untrackedValue$ === NEEDS_COMPUTATION, 'Invalid state');
    return this.$untrackedValue$;
  }

  abstract $computeIfNeeded$(): boolean;
}
