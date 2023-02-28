/* eslint-disable */
import { component$, useComputed$, useSignal } from '@builder.io/qwik';

export const ComputedRoot = component$(() => {
  const count = useSignal(0);
  const double = useComputed$(() => count.value * 2, 0);
  const plus3 = useComputed$(() => double.value + 3, 0);
  const triple = useComputed$(() => plus3.value * 3, 0);
  const sum = useComputed$(() => double.value + plus3.value + triple.value, 0);

  return (
    <div>
      <div>count: {count.value}</div>
      <div>double: {double.value}</div>
      <div>plus3: {plus3.value}</div>
      <div>triple: {triple.value}</div>
      <div>sum: {sum.value}</div>
      <button onClick$={() => count.value++}>Increment</button>
    </div>
  );
});
