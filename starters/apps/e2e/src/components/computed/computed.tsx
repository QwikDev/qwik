/* eslint-disable */
import { component$, useComputed$, useSignal } from '@builder.io/qwik';

export const ComputedRoot = component$(() => {
  const rerender = useSignal(0);

  return (
    <div key={rerender.value}>
      <button onClick$={() => rerender.value++}>Rerender</button>
      <ComputedBasic />
    </div>
  );
});

export const ComputedBasic = component$(() => {
  const count = useSignal(0);
  const double = useComputed$(() => count.value * 2);
  const plus3 = useComputed$(() => double.value + 3);
  const triple = useComputed$(() => plus3.value * 3);
  const sum = useComputed$(() => double.value + plus3.value + triple.value);

  console.log('here');
  console.log(sum.value);
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
