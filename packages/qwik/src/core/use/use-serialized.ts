import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { QRL } from '../shared/qrl/qrl.public';
import {
  SerializerSignal as SerializerSignalImpl,
  type ComputedSignal,
  type SerializerArg,
} from '../signal/signal';
import type { createSerializer$ } from '../signal/signal.public';
import { useComputedCommon } from './use-computed';

/** @internal */
export const useSerializerQrl = <T, S>(qrl: QRL<SerializerArg<T, S>>) =>
  useComputedCommon(qrl as any, SerializerSignalImpl as typeof ComputedSignal);

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
 * }
 * const Cmp = component$(() => {
 *   const custom = useSerializer$({
 *     deserialize: (data) => new MyCustomSerializable(data),
 *     serialize: (data) => data.n,
 *     initial: 2,
 *   });
 *   return <div onClick$={() => custom.value.inc()}>{custom.value.n}</div>;
 * });
 * ```
 *
 * @example
 *
 * When using a Signal as the data to create the object, you may not need `serialize`. Furthermore,
 * when the signal is updated, the serializer will be updated as well, and the current object will
 * be passed as the second argument.
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const n = useSignal(2);
 *   const custom = useSerializer$((_data, current) => {
 *     if (current) {
 *       current.n = n.value;
 *       return current;
 *     }
 *     return new MyCustomSerializable(n.value);
 * });
 *   return <div onClick$={() => n.value++}>{custom.value.n}</div>;
 * });
 * ```
 *
 * (note that in this example, the `{custom.value.n}` is not reactive, so the div text will not
 * update)
 *
 * @public
 */
export const useSerializer$: typeof createSerializer$ = implicit$FirstArg(useSerializerQrl as any);
