export type NoSerialize<T> = (T & { __no_serialize__: true }) | undefined;
import { useTask$, component$, noSerialize } from '@builder.io/qwik';
export interface Value {
  value: number;
  fn: NoSerialize<() => void>;
}
export function getFn(): NoSerialize<() => void> {
  return noSerialize(() => {});
}
export const HelloWorld = component$(() => {
  const state: Value = { value: 12, fn: getFn() };
  useTask$(() => {
    // eslint-disable-next-line no-console
    console.log(state.value);
  });
  return <div></div>;
});
