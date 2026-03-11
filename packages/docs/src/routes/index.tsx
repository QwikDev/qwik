import { component$, Slot, type PropsOf } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';
import { Button } from '~/components/button/button';
import { lucide } from '@qds.dev/ui';
import { Spacer } from '~/components/spacer/spacer';
import { BuilderLogo } from '~/components/svgs/builder-logo';
import { Header } from '../components/header/header';

export default component$(() => {
  const clouds = [
    <Cloud class="absolute -top-3/4 left-0" />,
    <Cloud class="absolute -left-1/4 top-1/2" />,
    <Cloud class="absolute -right-1/8 -top-1/8" />,
  ];

  return (
    <>
      <Header />
      <main>
        <section class="relative space-y-10 flex flex-col items-center overflow-x-clip mx-auto px-4">
          <Decor />
          {/* Design spacer. TODO: adjust as needed for responsiveness */}
          <Spacer class="md:h-63.5 h-[128px]" />

          <div class="relative">
            <h1 class="uppercase font-display md:text-h2 text-[40px] max-w-[15ch] text-center relative z-10">
              Automatically <span class="text-violet-75">Instant</span> Web Apps
            </h1>
            {clouds}
          </div>

          <p class="text-body-md max-w-[50ch] text-center">
            A new kind of framework for you to ship quicker and provide better user experiences
            every step of the way.
          </p>

          {/* margin collapse from space-y so that the 110.5px is accurate */}
          <div class="flex gap-6 justify-center md:mb-[110.5px] mb-[40px] flex-wrap">
            <Button variant="primary" class="md:text-base text-sm">
              <span>Qwik Start</span>
              <lucide.arrowright />
            </Button>

            <Button variant="secondary" class="md:text-base text-sm">
              <span>npm create qwik@latest</span>
              <lucide.clipboard />
            </Button>
          </div>

          <div class="flex gap-6 items-center py-4">
            <span class="text-slate-75 text-sm">Special Sponsor</span>
            <div class="flex">
              <BuilderLogo width={117.35} height={25.2} />
              <div class="w-px h-[25.2px] bg-slate-75 ml-7 md:block hidden" />
            </div>
            <span class="max-w-[20ch] text-slate-75 text-sm md:block hidden">
              Ship twice as much, twice as fast
            </span>
          </div>
        </section>

        <section class="grid md:grid-cols-2 grid-cols-1 md:gap-20 max-w-[1440px] mx-auto md:pt-32 pt-10 pb-20 md:px-20 px-4 box-content">
          <div class="flex flex-col">
            <Card class="z-1">
              <div class="md:p-10 p-6 flex flex-col gap-2 md:max-w-[48ch] max-w-[260px] text-center">
                <h3 class="font-heading md:text-h5 text-sm ">Zero induced delays</h3>
                <p class="md:text-body text-sm">
                  Your app stays quick, no matter how large it gets.
                </p>
              </div>
            </Card>

            <Card class="self-end transform -translate-y-16 z-0">
              <div class="md:p-10 p-6 flex flex-col gap-2 md:max-w-[48ch] max-w-[260px] text-center">
                <h3 class="font-heading md:text-h5 text-sm">
                  <span class="text-sky-75">~20s</span> quicker or more on 3G 🤯
                </h3>
                <p>
                  Time to Interactive measured on chrome 3G throttling on a few mid-size sample
                  apps.
                </p>
              </div>
            </Card>
          </div>
          <div class="flex flex-col md:gap-10 gap-8">
            <div class="relative">
              <h2 class="font-heading md:text-h3 text-[28px]">
                <span class="bg-violet-10 mb-2 block w-fit shadow-heading">Introducing</span>
                <span class="bg-violet-10 shadow-heading">JavaScript Streaming</span>
              </h2>
              <VideoPlayerIcon class="absolute left-4/7 -top-2/5 transform" />
            </div>

            <div class="space-y-6">
              <p class="w-fit">
                <span class="shadow-body leading-[2.5]">
                  Qwik is like video streaming, but with JavaScript.
                </span>
              </p>

              <p class="max-w-[50ch]">
                <span class="shadow-body leading-[2.5]">
                  There's no waiting for the entire code to be downloaded. Clicks respond instantly.
                </span>
              </p>

              <p class="w-fit">
                <span class="shadow-body leading-[2.5]">
                  You build your features - Qwik optimizes your code automatically
                </span>
              </p>
            </div>

            <Button class="w-fit md:text-base text-sm" variant="primary">
              <span>Discover more</span>
              <lucide.arrowright />
            </Button>
          </div>
        </section>
      </main>
    </>
  );
});

export const VideoPlayerIcon = component$((props: PropsOf<'svg'>) => {
  return (
    <svg
      width="98"
      height="98"
      viewBox="0 0 98 98"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g filter="url(#filter0_d_365_1969)">
        <path
          d="M90.2888 35.4864L86.5797 34.5518L75.4068 78.8907L79.1159 79.8253L90.2888 35.4864Z"
          fill="#45C6FF"
        />
        <path
          d="M75.4067 78.8908L71.7219 77.9623L70.7934 81.6471L74.4782 82.5756L75.4067 78.8908Z"
          fill="#45C6FF"
        />
        <path
          d="M87.5082 30.8669L83.8234 29.9384L82.8948 33.6232L86.5796 34.5517L87.5082 30.8669Z"
          fill="#45C6FF"
        />
        <path
          d="M70.796 81.6478L11.6936 66.7547L10.759 70.4638L69.8614 85.3568L70.796 81.6478Z"
          fill="#45C6FF"
        />
        <path
          d="M60.6983 43.7568L57.0135 42.8283L57.942 39.1434L54.2305 38.2082L55.1652 34.4991L51.4803 33.5706L52.4089 29.8858L41.3302 27.0941L32.0205 64.0392L43.0992 66.8309L44.0338 63.1218L47.7186 64.0504L48.6471 60.3656L52.3586 61.3008L53.2933 57.5917L56.9781 58.5203L57.9066 54.8355L61.589 55.7634L63.4521 48.3695L59.7698 47.4416L60.6983 43.7568Z"
          fill="#45C6FF"
        />
        <path
          d="M84.7545 26.2542L25.6521 11.3611L24.7236 15.0459L83.826 29.939L84.7545 26.2542Z"
          fill="#45C6FF"
        />
        <path
          d="M12.6197 63.0692L8.91064 62.1346L7.98212 65.8194L11.6912 66.754L12.6197 63.0692Z"
          fill="#45C6FF"
        />
        <path
          d="M24.7211 15.0453L21.0121 14.1107L20.0836 17.7955L23.7926 18.7301L24.7211 15.0453Z"
          fill="#45C6FF"
        />
        <path
          d="M20.0835 17.7955L16.3987 16.867L5.22581 61.206L8.91062 62.1345L20.0835 17.7955Z"
          fill="#45C6FF"
        />
      </g>
      <defs>
        <filter
          id="filter0_d_365_1969"
          x="5.22583"
          y="11.3611"
          width="91.063"
          height="79.9958"
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
            values="0 0 0 0 0 0 0 0 0 0.709804 0 0 0 0 0.945098 0 0 0 1 0"
          />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_365_1969" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_365_1969"
            result="shape"
          />
        </filter>
      </defs>
    </svg>
  );
});

export const Card = component$(({ class: className, ...rest }: PropsOf<'div'>) => {
  const dots = Array.from({ length: 3 }).map(() => <div class="bg-white size-3 rounded-full" />);

  return (
    <div
      class={[
        'shadow-card w-fit rounded-2xl border-[1.6px] border-sky-55 h-fit bg-white',
        className,
      ]}
      {...rest}
    >
      <div class="bg-sky-10 border-b-[1.6px] border-sky-55 h-11 rounded-t-2xl flex gap-2 px-3 items-center">
        {dots}
      </div>

      <Slot />
    </div>
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
          <rect y="27.7452" width="40.8471" height="9.24841" fill="#45C6FF" />
          <rect x="40.8471" y="27.7452" width="80.1529" height="9.24841" fill="white" />
          <rect x="14.6433" y="18.4968" width="36.9936" height="9.24841" fill="#45C6FF" />
          <rect x="51.637" y="18.4968" width="52.4076" height="9.24841" fill="white" />
          <rect x="33.9108" y="9.24841" width="32.3694" height="9.24841" fill="#45C6FF" />
          <rect x="66.2803" y="9.24841" width="28.5159" height="9.24841" fill="white" />
          <rect x="47.0128" width="22.3503" height="9.24841" fill="#45C6FF" />
          <rect x="60.1146" width="20.0382" height="9.24841" fill="white" />
          <rect x="92.4841" y="27.7452" width="11.5605" height="9.24841" fill="#45C6FF" />
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

export const head: DocumentHead = {
  title: 'Framework reimagined for the edge!',
};
