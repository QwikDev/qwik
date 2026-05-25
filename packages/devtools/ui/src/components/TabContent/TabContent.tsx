import { component$, Slot } from '@qwik.dev/core';

export const TabContent = component$(() => {
  return (
    <div
      class="animate-slide-up-fade flex h-full w-full flex-col space-y-8"
      style="animation-duration: 0.3s; animation-fill-mode: both; animation-delay: 0.1s;"
    >
      <div class="border-glass-border flex items-center justify-between border-b px-2 pb-4">
        <Slot name="title" />
      </div>

      <div class="custom-scrollbar flex-1 overflow-y-auto px-2 pb-8">
        <Slot name="content" />
      </div>
    </div>
  );
});
