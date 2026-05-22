import { component$, Slot } from '@qwik.dev/core';

export const DevtoolsContainer = component$(() => {
  return (
    <div class="qwik-devtools">
      <div class="fixed right-0 bottom-0 z-[2147483647] font-sans" q:slot="content">
        <Slot />
      </div>
    </div>
  );
});
