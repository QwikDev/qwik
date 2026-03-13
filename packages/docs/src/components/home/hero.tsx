import { component$, type PropsOf } from '@qwik.dev/core';
import { Button } from '~/components/action/action';
import { lucide } from '@qds.dev/ui';
import { Spacer } from '~/components/spacer/spacer';
import { BuilderLogo } from '~/components/svgs/builder-logo';

export const Hero = component$(() => {
  const clouds = [
    <Cloud class="absolute -top-3/4 left-0" />,
    <Cloud class="absolute -left-1/4 top-1/2" />,
    <Cloud class="absolute -right-1/8 -top-1/8" />,
  ];

  const shimmerMarkup = (
    <span
      class="absolute inset-0 bg-gradient-text-shimmer animate-shimmer opacity-75 mix-blend-screen"
      aria-hidden="true"
    >
      Automatically Instant Web Apps
    </span>
  );

  return (
    <section class="relative space-y-10 flex flex-col items-center overflow-x-clip mx-auto px-4">
      <Decor />
      {/* Design spacer. TODO: adjust as needed for responsiveness */}
      <Spacer class="3xl:h-63.5 h-[128px]" />

      <div class="relative">
        <h1 class="uppercase font-display 3xl:text-h2 text-[40px] max-w-[15ch] text-center relative z-10">
          <span>
            Automatically <span class="text-primary-standalone-emphasis">Instant</span> Web Apps
          </span>
          {shimmerMarkup}
        </h1>
        {clouds}
      </div>

      <p class="text-body-md max-w-[50ch] text-center">
        A new kind of framework for you to ship quicker and provide better user experiences every
        step of the way.
      </p>

      {/* margin collapse from space-y so that the 110.5px is accurate */}
      <div class="flex gap-6 justify-center 3xl:mb-[110.5px] mb-[40px] flex-wrap">
        <Button variant="primary" class="3xl:text-base text-sm">
          <span>Qwik Start</span>
          <lucide.arrowright />
        </Button>

        <Button variant="secondary" class="3xl:text-base text-sm">
          <span>npm create qwik@latest</span>
          <lucide.clipboard />
        </Button>
      </div>

      <div class="flex gap-6 items-center py-4">
        <span class="text-foreground-soft text-sm">Special Sponsor</span>
        <div class="flex text-foreground-accent">
          <BuilderLogo width={117.35} height={25.2} />
          <div class="w-px h-[25.2px] bg-foreground-soft ml-7 3xl:block hidden" />
        </div>
        <span class="max-w-[20ch] text-foreground-soft text-sm 3xl:block hidden">
          Ship twice as much, twice as fast
        </span>
      </div>
    </section>
  );
});

export const Decor = component$(() => {
  return (
    <>
      {/* blue gradient — centered on section, shifted left */}
      <div
        class="absolute -z-2 left-1/2 top-1/2 -translate-x-[110%] -translate-y-[55%]
          w-[1600px] h-[1200px] bg-hero-gradient-blue"
      />

      {/* purple gradient — centered on section bottom, shifted right */}
      <div
        class="absolute -z-2 left-1/2 bottom-1/4 translate-x-[15%] translate-y-1/2
          w-[1600px] h-[1200px] bg-hero-gradient-purple"
      />

      {/* star background */}
      <div aria-hidden="true" class="absolute inset-0 -z-1 bg-grid-stars" />
    </>
  );
});

export const Cloud = component$((props: PropsOf<'div'>) => {
  return (
    <div {...props}>
      <svg
        width="127"
        height="43"
        viewBox="0 0 127 43"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g filter="url(#filter0_d_204_2319)">
          <rect y="27.7452" width="40.8471" height="9.24841" class="fill-border-base" />
          <rect
            x="40.8471"
            y="27.7452"
            width="80.1529"
            height="9.24841"
            class="fill-background-base"
          />
          <rect x="14.6433" y="18.4968" width="36.9936" height="9.24841" class="fill-border-base" />
          <rect
            x="51.637"
            y="18.4968"
            width="52.4076"
            height="9.24841"
            class="fill-background-base"
          />
          <rect x="33.9108" y="9.24841" width="32.3694" height="9.24841" class="fill-border-base" />
          <rect
            x="66.2803"
            y="9.24841"
            width="28.5159"
            height="9.24841"
            class="fill-background-base"
          />
          <rect x="47.0128" width="22.3503" height="9.24841" class="fill-border-base" />
          <rect x="60.1146" width="20.0382" height="9.24841" class="fill-background-base" />
          <rect x="92.4841" y="27.7452" width="11.5605" height="9.24841" class="fill-border-base" />
        </g>
        <defs>
          <filter
            id="filter0_d_204_2319"
            x="0"
            y="0"
            width="127"
            height="42.9936"
            filterUnits="userSpaceOnUse"
            color-interpolation-filters="auto"
          >
            <feFlood flood-opacity="0" result="BackgroundImageFix" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dx="6" dy="6" />
            <feComposite in2="hardAlpha" operator="out" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.270588 0 0 0 0 0.776471 0 0 0 0 1 0 0 0 1 0"
            />
            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_204_2319" />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="effect1_dropShadow_204_2319"
              result="shape"
            />
          </filter>
        </defs>
      </svg>
    </div>
  );
});
