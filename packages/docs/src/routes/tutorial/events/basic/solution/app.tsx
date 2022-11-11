import { component$ } from '@builder.io/qwik';

export default component$(() => {
  return <button onClick$={() => alert('Hello World!')}>Click Me</button>;
});
