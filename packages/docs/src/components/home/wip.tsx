import { component$ } from '@qwik.dev/core';
import { streamlinepixel as pixel } from '@qds.dev/ui';

export const Wip = component$(() => {
  return (
    <section class="relative overflow-x-clip flex justify-center w-full max-w-[1280px] mx-auto 2xl:pt-40 md:pt-24 pt-16 pb-20 2xl:px-20 px-4">
      <div class="relative">
        <h2 class="relative z-2 uppercase font-display 2xl:text-[160px] md:text-[120px] text-[56px] leading-none">
          <span class="relative block bg-secondary-background-base px-[0.2em] pt-[0.05em] pb-[0.15em] shadow-[8px_8px_0_0_var(--color-primary-shadow-accent)] md:shadow-[12px_12px_0_0_var(--color-primary-shadow-accent)]">
            WIP...
            <span
              aria-hidden="true"
              class="absolute inset-0 px-[0.2em] pt-[0.05em] pb-[0.15em] bg-gradient-text-shimmer motion-safe:animate-shimmer opacity-75 mix-blend-screen"
            >
              WIP...
            </span>
          </span>
        </h2>
        <pixel.interfaceessentialwaitinghourglassloading class="absolute -top-14 -right-8 md:-top-16 md:-right-16 z-1 size-16 md:size-28 rotate-12 text-border-base drop-shadow-[6px_6px_0_var(--color-shadow-emphasis)]" />
      </div>
    </section>
  );
});
