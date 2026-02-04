import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { QRL } from '../shared/qrl/qrl.public';
import type { SerializerArg } from '../reactive-primitives/types';
import type { createSerializer$ } from '../reactive-primitives/signal.public';
import { createSerializerSignal } from '../reactive-primitives/signal-api';
import { useConstant } from './use-signal';

const creator = <T, S>(qrl: QRL<SerializerArg<T, S>>) => {
  qrl.resolve();
  return createSerializerSignal<T, S>(qrl as any);
};

/** @internal */
export const useSerializerQrl = <T, S>(qrl: QRL<SerializerArg<T, S>>) =>
  useConstant(creator<T, S>, qrl);

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
 * When using a Signal as the data to create the object, you need to pass the configuration as a
 * function, and you can then also provide the `update` function to update the object when the
 * signal changes.
 *
 * By returning an object from `update`, you signal that the listeners have to be notified. You can
 * mutate the current object but you should return it so that it will trigger listeners.
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const n = useSignal(2);
 *   const custom = useSerializer$(() =>
 *     ({
 *       deserialize: () => new MyCustomSerializable(n.value),
 *       update: (current) => {
 *         current.n = n.value;
 *         return current;
 *       }
 *     })
 *   );
 *   return <div onClick$={() => n.value++}>{custom.value.n}</div>;
 * });
 * ```
 *
 * @public
 */
export const useSerializer$: typeof createSerializer$ = implicit$FirstArg(useSerializerQrl as any);
