import { qwikDebugToString } from '../../debug';
import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { Container } from '../../shared/types';
import { trackSignal } from '../../use/use-core';
import { NEEDS_COMPUTATION } from '../flags';
import { throwIfQRLNotResolved } from '../signal';
import type { SerializerArg } from '../types';
import { EffectProperty, SignalFlags, type ComputeQRL } from '../types';
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
    super(container, argQrl as unknown as ComputeQRL<T>);
  }
  $didInitialize$: boolean = false;

  $computeIfNeeded$(): boolean {
    if (!(this.$flags$ & SignalFlags.INVALID)) {
      return false;
    }
    throwIfQRLNotResolved(this.$computeQrl$);
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
          ? update?.(currentValue as T)
          : deserialize(currentValue as Awaited<S>),
      this,
      EffectProperty.VNODE,
      this.$container$!
    );
    DEBUG && log('SerializerSignal.$compute$', untrackedValue);
    const didChange =
      (this.$didInitialize$ && untrackedValue !== 'undefined') ||
      untrackedValue !== this.$untrackedValue$;
    this.$flags$ &= ~SignalFlags.INVALID;
    this.$didInitialize$ = true;
    if (didChange) {
      this.$untrackedValue$ = untrackedValue as T;
    }
    return didChange;
  }
}
