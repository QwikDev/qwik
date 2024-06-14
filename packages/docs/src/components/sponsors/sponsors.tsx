import { component$ } from '@builder.io/qwik';
import { BuilderLogo } from '../svgs/builder-logo';

export const Sponsors = component$(() => {
  // the margin tops are to counterract the margin in the builder block
  return (
    <div class="mb-5 md:mb-20 border-t border-b border-dotted border-[#343434] px-4 mt-[-19px] sm:mt-[-80px] isolate">
      <div class="max-w-screen-xl mx-auto flex items-center py-4 md:justify-center justify-center flex-col md:flex-row gap-4 md:gap-8">
        <span class="font-semibold text-[14px] md:text-base md:mt-1">Special Sponsor</span>
        <a href="https://builder.io/">
          <BuilderLogo width={200} height={40} />
        </a>
        <span class="text-[14px] md:text-base font-semibold md:mt-1">Visual Headless CMS</span>
      </div>
    </div>
  );
});
