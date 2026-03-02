import { component$ } from '@qwik.dev/core';

export default component$(() => {
  return <button onClick$={() => alert('Hello World!')}>Click Me</button>;
});
