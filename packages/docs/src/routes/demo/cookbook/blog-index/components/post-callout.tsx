import { component$, Slot } from '@qwik.dev/core';

/** A small callout box shared by the demo blog posts. */
export const PostCallout = component$(() => {
  return (
    <aside class="rounded-lg border-2 border-dashed p-4">
      <Slot />
    </aside>
  );
});
