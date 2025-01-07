import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { QRL } from '../shared/qrl/qrl.public';
import {
  SerializedSignal as SerializedSignalImpl,
  type ComputedSignal,
  type ConstructorFn,
} from '../signal/signal';
import type { createSerialized$ } from '../signal/signal.public';
import { useComputedCommon } from './use-computed';

/** @internal */
export const useSerializedQrl = <F extends ConstructorFn<any, any>>(qrl: QRL<F>) =>
  useComputedCommon(qrl as any, SerializedSignalImpl as typeof ComputedSignal);

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
export const useSerialized$: typeof createSerialized$ = implicit$FirstArg(useSerializedQrl as any);
