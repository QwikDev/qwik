import { component$, type QRL, implicit$FirstArg, useStore } from '@qwik.dev/core';

export function delayQrl<T>(fn: QRL<() => T>, delayInMs: number): Promise<T> {
  return new Promise((res) => {
    setTimeout(() => {
      res(fn());
    }, delayInMs);
  });
}

export const delay$ = implicit$FirstArg(delayQrl);

export default component$(() => {
  const store = useStore({ count: 0, delay: 0 });
  return (
    <>
      Count: {store.count} <br />
      Delay: {store.delay} <br />
      <button
        onClick$={async () => {
          store.count++;
          // This code should be delayed by 1000ms
          store.delay++;
        }}
      >
        +1
      </button>
    </>
  );
});
