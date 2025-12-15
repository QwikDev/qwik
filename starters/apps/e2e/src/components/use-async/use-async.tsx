import { component$, useAsync$, useSignal } from "@qwik.dev/core";

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
  const double = useAsync$(({ track }) => Promise.resolve(track(count) * 2));
  const plus3 = useAsync$(({ track }) => Promise.resolve(track(double) + 3));
  const triple = useAsync$(({ track }) => Promise.resolve(track(plus3) * 3));
  const sum = useAsync$(({ track }) =>
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
  const double = useAsync$(
    ({ track }) =>
      new Promise<number>((resolve) => {
        setTimeout(() => {
          resolve(track(count) * 2);
        }, 1000);
      }),
  );

  return (
    <div>
      {(double as any).loading ? "loading" : "not loading"}
      <div class="result">double: {double.value}</div>
      <button id="increment" onClick$={() => count.value++}>
        Increment
      </button>
    </div>
  );
});
