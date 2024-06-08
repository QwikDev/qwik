import { component$ } from '@builder.io/qwik';
import { BuilderLogo } from '../svgs/builder-logo';

export const Sponsors = component$(() => {
  // the margin tops are to counterract the margin in the builder block
  return (
    <div class="mb-5 md:mb-20 border-t border-b border-dotted border-[#343434] px-4 mt-[-19px] sm:mt-[-80px]">
      <div class="max-w-screen-xl mx-auto flex items-center py-4 md:justify-between justify-center flex-col md:flex-row gap-4">
        <span class="font-semibold text-[14px] md:text-base">Special Sponsor</span>
        <a href="https://builder.io/">
          <BuilderLogo width={200} height={40} />
        </a>
        <span class="text-xl md:text-2xl font-bold">Visual Headless CMS</span>
      </div>
    </div>
  );
});
