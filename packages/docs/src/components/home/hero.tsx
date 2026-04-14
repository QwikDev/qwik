import { $, component$, type PropsOf, useSignal } from '@qwik.dev/core';
import { Button, Link } from '~/components/action/action';
import { lucide } from '@qds.dev/ui';
import { Spacer } from '~/components/spacer/spacer';
import { BuilderLogo } from '~/components/svgs/builder-logo';

const copyText = 'npm create qwik@beta';

const CopyButton = component$(() => {
  const copied = useSignal(false);

  const handleCopy = $(() => {
    navigator.clipboard.writeText(copyText);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  });

  return (
    <Button variant="secondary" class="2xl:text-base text-sm" onClick$={handleCopy}>
      <span>{copyText}</span>
      {copied.value ? <lucide.clipboardcheck /> : <lucide.clipboard />}
    </Button>
  );
});

export const Hero = component$(() => {
  const clouds = [
    <Cloud class="absolute sm:-top-3/4 -top-[60px] left-0" />,
    <Cloud class="absolute -left-1/3 2xl:-left-1/4 top-1/2 hidden sm:block" />,
    <Cloud class="absolute -right-1/3 2xl:-right-1/8 -top-1/8 hidden sm:block" />,
  ];

  const shimmerMarkup = (
    <span
      class="absolute inset-0 bg-gradient-text-shimmer animate-shimmer opacity-75 mix-blend-screen"
      aria-hidden="true"
    >
      Auto&shy;matically Instant Web Apps
    </span>
  );

  return (
    <section class="relative space-y-10 flex flex-col items-center overflow-x-clip mx-auto px-4">
      <Decor />
      {/* Design spacer. TODO: adjust as needed for responsiveness */}
      <Spacer class="2xl:h-[254px] h-[64px]" />

      <div class="relative">
        <h1 class="uppercase font-display 2xl:text-h2 text-[40px] max-w-[15ch] text-center relative z-10">
          <span>
            Auto&shy;matically <span class="text-primary-standalone-emphasis">Instant</span> Web
            Apps
          </span>
          {shimmerMarkup}
        </h1>
        {clouds}
      </div>

      <p class="text-body-sm 2xl:text-body-md max-w-[50ch] text-center">
        A new kind of framework for you to ship quicker and provide better user experiences every
        step of the way.
      </p>

      {/* margin collapse from space-y so that the 110.5px is accurate */}
      <div class="flex gap-6 justify-center 2xl:mb-[110.5px] mb-[40px] flex-wrap">
        <Link href="/docs/getting-started" variant="primary" class="2xl:text-base text-sm">
          <span>Qwik Start</span>
          <lucide.arrowright />
        </Link>

        <CopyButton />
      </div>

      <div class="flex gap-6 items-center py-4">
        <span class="text-foreground-soft text-sm">Special Sponsor</span>
        <div class="flex text-foreground-accent">
          <BuilderLogo width={117.35} height={25.2} />
          <div class="w-px h-[25.2px] bg-foreground-soft ml-7 2xl:block hidden" />
        </div>
        <span class="max-w-[20ch] text-foreground-soft text-sm 2xl:block hidden">
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
        class="absolute -z-2 left-1/2 top-1/2 -translate-x-[90%] -translate-y-[80%]
          w-[250vw] h-[200vw] bg-hero-gradient-blue
          2xl:w-[1600px] 2xl:h-[1200px] 2xl:-translate-x-[110%]"
      />

      {/* purple gradient — centered on section bottom, shifted right */}
      <div
        class="absolute -z-2 right-0 bottom-0 translate-x-[60%] translate-y-[45%]
          w-[min(150vw,1600px)] h-[min(120vw,1200px)] bg-hero-gradient-purple
          2xl:left-1/2 2xl:right-auto 2xl:bottom-1/4 2xl:translate-x-[10%] 2xl:translate-y-1/2
          2xl:w-[1600px] 2xl:h-[1200px]"
      />
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
