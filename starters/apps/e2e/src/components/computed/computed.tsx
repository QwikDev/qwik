/* eslint-disable */
import { component$, useComputed$, useSignal } from '@builder.io/qwik';

export const ComputedRoot = component$(() => {
  const rerender = useSignal(0);

  return (
    <div key={rerender.value}>
      <button id="rerender" onClick$={() => rerender.value++}>
        Rerender
      </button>
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
  return (
    <div>
      <div class="result">count: {count.value}</div>
      <div class="result">double: {double.value}</div>
      <div class="result">plus3: {plus3.value}</div>
      <div class="result">triple: {triple.value}</div>
      <div class="result">sum: {sum.value + ''}</div>
      <button id="increment" onClick$={() => count.value++}>
        Increment
      </button>
    </div>
  );
});
