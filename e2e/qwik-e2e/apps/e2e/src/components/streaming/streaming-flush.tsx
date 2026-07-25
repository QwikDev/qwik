import { component$ } from '@qwik.dev/core';
import { delay } from '../delay';

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
