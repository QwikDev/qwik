import { qwikDebugToString } from '../../debug';
import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { Container } from '../../shared/types';
import { trackSignal } from '../../use/use-core';
import type { SerializerArg } from '../types';
import {
  EffectProperty,
  NEEDS_COMPUTATION,
  SerializationSignalFlags,
  SignalFlags,
  type ComputeQRL,
} from '../types';
import { scheduleEffects, throwIfQRLNotResolved } from '../utils';
import { ComputedSignalImpl } from './computed-signal-impl';

const DEBUG = false;
// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('SERIALIZER SIGNAL', ...args.map(qwikDebugToString));

/**
 * A signal which provides a non-serializable value. It works like a computed signal, but it is
 * handled slightly differently during serdes.
 *
 * @public
 */
export class SerializerSignalImpl<T, S> extends ComputedSignalImpl<T> {
  constructor(container: Container | null, argQrl: QRLInternal<SerializerArg<T, S>>) {
    super(
      container,
      argQrl as unknown as ComputeQRL<T>,
      SignalFlags.INVALID | SerializationSignalFlags.SERIALIZATION_STRATEGY_ALWAYS
    );
  }
  $didInitialize$: boolean = false;

  $computeIfNeeded$() {
    if (!(this.$flags$ & SignalFlags.INVALID)) {
      return;
    }
    throwIfQRLNotResolved(this.$computeQrl$);

    this.$flags$ &= ~SignalFlags.INVALID;

    let arg = (this.$computeQrl$ as any as QRLInternal<SerializerArg<T, S>>).resolved!;
    if (typeof arg === 'function') {
      arg = arg();
    }
    const { deserialize, initial } = arg;
    const update = (arg as any).update as ((current: T) => T) | undefined;
    const currentValue =
      this.$untrackedValue$ === NEEDS_COMPUTATION ? initial : this.$untrackedValue$;
    const untrackedValue = trackSignal(
      () =>
        this.$didInitialize$
          ? update?.(currentValue as T) || currentValue
          : deserialize(currentValue as Awaited<S>),
      this,
      EffectProperty.VNODE,
      this.$container$!
    );
    this.$didInitialize$ = true;

    DEBUG && log('SerializerSignal.$compute$', untrackedValue);
    // We allow forcing the update of the signal without changing the value, for example when the deserialized value is the same reference as the old value but its internals have changed. In that case we want to trigger effects that depend on this signal, even though the value is the same.
    const didChange =
      (this.$didInitialize$ && untrackedValue !== 'undefined') ||
      untrackedValue !== this.$untrackedValue$;
    if (didChange) {
      this.$untrackedValue$ = untrackedValue as T;
      scheduleEffects(this.$container$, this, this.$effects$);
    }
  }
}
