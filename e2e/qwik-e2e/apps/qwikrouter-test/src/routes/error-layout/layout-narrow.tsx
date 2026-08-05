import { component$, Slot } from '@qwik.dev/core';

export default component$(() => {
  return (
    <div data-narrow-layout="">
      <Slot />
    </div>
  );
});
