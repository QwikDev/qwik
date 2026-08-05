import { component$ } from '@qwik.dev/core';

export function delay(time: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), time);
  });
}

export const AsyncCmp = component$(async () => {
  await delay(5000);
  return <span id="async-result">Async done</span>;
});

export const StreamingFlush = component$(() => {
  return (
    <div>
      <h1 id="prefix">Prefix content</h1>
      <AsyncCmp />
    </div>
  );
});
