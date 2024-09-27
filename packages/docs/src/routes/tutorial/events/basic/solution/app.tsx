import { component$ } from '@qwikdev/core';

export default component$(() => {
  return <button onClick$={() => alert('Hello World!')}>Click Me</button>;
});
