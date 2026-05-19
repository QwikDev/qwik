import { component$, $ } from '@qwik.dev/core';

export default component$(() => {
  return (
    <>
      <button onClick$={async () => alert(await $('Hello World!').resolve())}>click me</button>
    </>
  );
});
