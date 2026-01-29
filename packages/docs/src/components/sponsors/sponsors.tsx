import { component$ } from '@qwik.dev/core';
import { BuilderLogo } from '../svgs/builder-logo';

export const Sponsors = component$(() => {
  // the margin tops are to counterract the margin in the builder block
  return (
    <div class="isolate mt-[-19px] mb-5 border-t border-b border-dotted border-[#343434] px-4 sm:mt-[-80px] md:mb-20">
      <div class="mx-auto flex max-w-screen-xl flex-col items-center justify-center gap-4 py-4 md:flex-row md:justify-center md:gap-8">
        <span class="text-[14px] font-semibold md:mt-1 md:text-base">Special Sponsor</span>
        <a href="https://builder.io/">
          <BuilderLogo width={200} height={40} />
        </a>
        <span class="text-[14px] font-semibold md:mt-1 md:text-base">Visual Headless CMS</span>
      </div>
    </div>
  );
});
