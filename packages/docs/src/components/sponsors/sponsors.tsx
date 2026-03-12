import { component$ } from '@qwik.dev/core';
import { BuilderLogo } from '../svgs/builder-logo';

export const Sponsors = component$(() => {
  // the margin tops are to counterract the margin in the builder block
  return (
    <div class="mb-5 3xl:mb-20 border-t border-b border-dotted border-[#343434] px-4 mt-[-19px] 3xl:mt-[-80px] isolate">
      <div class="max-w-screen-3xl mx-auto flex items-center py-4 3xl:justify-center justify-center flex-col 3xl:flex-row gap-4 3xl:gap-8">
        <span class="font-semibold text-[14px] 3xl:text-base 3xl:mt-1">Special Sponsor</span>
        <a href="https://builder.io/">
          <BuilderLogo width={200} height={40} />
        </a>
        <span class="text-[14px] 3xl:text-base font-semibold 3xl:mt-1">Visual Headless CMS</span>
      </div>
    </div>
  );
});
