import { component$ } from '@qwik.dev/core';

export default component$(() => {
  return (
    <main>
      <Greeter />
    </main>
  );
});

export const Greeter = component$(() => {
  return <div>Hello World!</div>;
});
