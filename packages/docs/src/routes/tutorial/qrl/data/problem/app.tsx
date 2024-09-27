import { component$ } from '@qwikdev/core';

export default component$(() => {
  return (
    <>
      <button onClick$={async () => alert('Hello World!')}>click me</button>
    </>
  );
});
