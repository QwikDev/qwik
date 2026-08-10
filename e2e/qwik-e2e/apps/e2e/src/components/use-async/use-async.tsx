import { component$, useComputed$, useSignal } from '@qwik.dev/core';

export const AsyncRoot = component$(() => {
  const rerender = useSignal(0);

  return (
    <div key={rerender.value}>
      <button id="rerender" onClick$={() => rerender.value++}>
        Rerender
      </button>
      <span id="render-count">Renders: {rerender.value}</span>
      <AsyncBasic />
      <PendingComponent />
    </div>
  );
});

export const AsyncBasic = component$(() => {
  const count = useSignal(0);
  const double = useComputed$(() => Promise.resolve(count.value * 2));
  const plus3 = useComputed$(() => Promise.resolve(double.value + 3));
  const triple = useComputed$(() => Promise.resolve(plus3.value * 3));
  const sum = useComputed$(() => Promise.resolve(double.value + plus3.value + triple.value));

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

export const PendingComponent = component$(() => {
  const count = useSignal(0);
  const double = useComputed$(
    () =>
      new Promise<number>((resolve) => {
        // the read must happen synchronously: only then does the computed subscribe
        const value = count.value;
        setTimeout(() => {
          resolve(value * 2);
        }, 1000);
      })
  );

  return (
    <div>
      {(double as any).loading ? 'loading' : 'not loading'}
      <div class="result">double: {double.value}</div>
      <button id="increment" onClick$={() => count.value++}>
        Increment
      </button>
    </div>
  );
});
