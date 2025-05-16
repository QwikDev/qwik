import { component$, useAsyncComputed$, useSignal } from "@qwik.dev/core";

export const AsyncComputedRoot = component$(() => {
  const rerender = useSignal(0);

  return (
    <div key={rerender.value}>
      <button id="rerender" onClick$={() => rerender.value++}>
        Rerender
      </button>
      <span id="render-count">Renders: {rerender.value}</span>
      <AsyncComputedBasic />
      <PendingComponent />
    </div>
  );
});

export const AsyncComputedBasic = component$(() => {
  const count = useSignal(0);
  const double = useAsyncComputed$(({ track }) =>
    Promise.resolve(track(count) * 2),
  );
  const plus3 = useAsyncComputed$(({ track }) =>
    Promise.resolve(track(double) + 3),
  );
  const triple = useAsyncComputed$(({ track }) =>
    Promise.resolve(track(plus3) * 3),
  );
  const sum = useAsyncComputed$(({ track }) =>
    Promise.resolve(track(double) + track(plus3) + track(triple)),
  );

  return (
    <div>
      <div class="result">count: {count.value}</div>
      <div class="result">double: {double.value}</div>
      <div class="result">plus3: {plus3.value}</div>
      <div class="result">triple: {triple.value}</div>
      <div class="result">sum: {sum.value + ""}</div>
      <button id="increment" onClick$={() => count.value++}>
        Increment
      </button>
    </div>
  );
});

export const PendingComponent = component$(() => {
  const count = useSignal(0);
  const double = useAsyncComputed$(
    ({ track }) =>
      new Promise<number>((resolve) => {
        setTimeout(() => {
          resolve(track(count) * 2);
        }, 1000);
      }),
  );

  return (
    <div>
      {(double as any).pending ? "pending" : "not pending"}
      <div class="result">double: {double.value}</div>
      <button id="increment" onClick$={() => count.value++}>
        Increment
      </button>
    </div>
  );
});
