import { component$, Slot } from '@qwik.dev/core';

export default component$(() => {
  return (
    <div data-ssg-404-layout="">
      <Slot />
    </div>
  );
});
