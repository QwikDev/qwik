import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { assertQrl } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import {
  SerializedSignal,
  throwIfQRLNotResolved,
  type ConstructorFn,
  type CustomSerializable,
} from '../signal/signal';
import type { ReadonlySignal, Signal } from '../signal/signal.public';
import { useSequentialScope } from './use-sequential-scope';

/** @internal */
export const useSerializedQrl = <
  T extends CustomSerializable<T, S>,
  S,
  F extends ConstructorFn<T, S>,
>(
  qrl: QRL<F>
): T extends Promise<any> ? never : ReadonlySignal<T> => {
  const { val, set } = useSequentialScope<Signal<T>>();
  if (val) {
    return val as any;
  }
  assertQrl(qrl);
  const signal = new SerializedSignal(null, qrl as any);
  set(signal);

  // Note that we first save the signal
  // and then we throw to load the qrl
  // This is why we can't use useConstant, we need to keep using the same qrl object
  throwIfQRLNotResolved(qrl);
  return signal as any;
};

/**
 * Creates a signal which holds a custom serializable value. It requires that the value implements
 * the `CustomSerializable` type, which means having a function under the `[SerializeSymbol]`
 * property that returns a serializable value when called.
 *
 * The `fn` you pass is called with the result of the serialization (in the browser, only when the
 * value is needed), or `undefined` when not yet initialized. If you refer to other signals, `fn`
 * will be called when those change just like computed signals, and then the argument will be the
 * previous output, not the serialized result.
 *
 * This is useful when using third party libraries that use custom objects that are not
 * serializable.
 *
 * Note that the `fn` is called lazily, so it won't impact container resume.
 *
 * @example
 *
 * ```tsx
 * class MyCustomSerializable {
 *   constructor(public n: number) {}
 *   inc() {
 *     this.n++;
 *   }
 *   [SerializeSymbol]() {
 *     return this.n;
 *   }
 * }
 * const Cmp = component$(() => {
 *   const custom = useSerialized$<MyCustomSerializable, number>(
 *     (prev) =>
 *       new MyCustomSerializable(prev instanceof MyCustomSerializable ? prev : (prev ?? 3))
 *   );
 *   return <div onClick$={() => custom.value.inc()}>{custom.value.n}</div>;
 * });
 * ```
 *
 * @public
 */
export const useSerialized$: {
  fn: <T extends CustomSerializable<T, S>, S, F extends ConstructorFn<T, S> = ConstructorFn<T, S>>(
    fn: F | QRL<F>
  ) => T extends Promise<any> ? never : ReadonlySignal<T>;
}['fn'] = implicit$FirstArg(useSerializedQrl as any);
