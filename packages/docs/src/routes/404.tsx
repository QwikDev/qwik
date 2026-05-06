import { component$, type PropsOf } from '@qwik.dev/core';

import { Header } from '../components/header/header';

import { Footer } from '~/components/footer/footer';
import { Cloud, Decor } from '~/components/home/hero';
import { Spacer } from '~/components/spacer/spacer';
import { Link } from '~/components/action/action';
import { lucide } from '@qds.dev/ui';

const Rocket = component$<PropsOf<'svg'>>((props) => {
  return (
    <svg
      {...props}
      width="209"
      height="192"
      viewBox="0 0 209 192"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M96.5194 147.799L118.013 135.064L82.2026 109.715L49.5839 123.249L96.5194 147.799Z"
        fill="#9838FC"
      />
      <path
        d="M151.134 70.6481L147.542 93.3508L111.731 68.0011L111.983 35.0996L151.134 70.6481Z"
        fill="#9838FC"
      />
      <path
        d="M81.3034 78.3607L88.949 83.7729L96.5946 89.1851L178.148 146.915C178.148 146.915 181.502 131.439 163.173 106.326C152.629 91.8793 141.203 80.6233 128.468 69.8297C120.283 62.8935 110.867 56.8639 100.875 50.713L96.9604 56.2425L91.8633 52.6344L87.2753 59.1157L82.1783 55.5076L71.1092 71.1444L76.2063 74.7525L81.3034 78.3607Z"
        fill="#AE76FE"
      />
      <path
        d="M81.3034 78.3607L88.949 83.7729L96.5946 89.185L178.148 146.915C178.148 146.915 164.432 155.552 134.496 146.837C117.275 141.823 102.82 134.846 88.3837 126.455C79.1068 121.062 70.2984 114.173 61.1884 106.776L65.2114 101.093L60.1143 97.485L64.8298 90.8237L59.7327 87.2156L71.1092 71.1444L76.2063 74.7525L81.3034 78.3607Z"
        fill="#AE76FE"
      />
      <path
        d="M67.6821 59.2966C64.7224 63.4776 62.6733 66.3722 57.6646 73.4479C52.1521 81.2352 33.8632 59.496 35.2292 57.5663C36.5952 55.6366 31.1914 44.0867 31.1914 44.0867C31.1914 44.0867 43.1977 46.3095 45.2467 43.4149C47.2957 40.5203 72.7961 52.0722 67.6821 59.2966Z"
        fill="#E36018"
      />
      <path
        d="M66.8123 60.5251C64.3673 63.979 62.6746 66.3702 58.537 72.2153C53.9832 78.6483 40.582 61.8982 41.7104 60.3041C42.8389 58.71 39.0632 49.656 39.0632 49.656C39.0632 49.656 48.2931 51.005 49.9857 48.6138C51.6784 46.2227 71.0369 54.5571 66.8123 60.5251Z"
        fill="#FFAE44"
      />
      <path
        d="M65.508 62.3677C63.8351 64.7309 62.6769 66.3669 59.8459 70.3662C56.7302 74.7677 47.8561 63.5161 48.6282 62.4254C49.4003 61.3347 46.936 55.2242 46.936 55.2242C46.936 55.2242 53.1321 56.0629 54.2903 54.4268C55.4484 52.7908 68.3985 58.2843 65.508 62.3677Z"
        fill="#FCE25E"
      />
      <path
        d="M80.0235 58.5518L61.6379 84.5244L53.3076 76.2646L68.9075 54.2273L80.0235 58.5518Z"
        fill="#9838FC"
      />
      <circle
        cx="151.273"
        cy="128.134"
        r="13.5137"
        transform="rotate(125.294 151.273 128.134)"
        fill="#D7F1FF"
        stroke="#9838FC"
        stroke-width="3.82979"
      />
      <path
        d="M127.288 102.416L131.819 113.893L119.488 113.435L69.6418 69.8795L127.288 102.416Z"
        fill="#9838FC"
      />
    </svg>
  );
});

export const Clouds = component$(() => {
  return [
    <Cloud class="absolute left-0 -mt-20" />,
    <Cloud class="absolute left-[100px] bottom-0 mb-10 hidden 2xl:block" />,
    <Cloud class="absolute right-0 top-[40%] -mt-20 hidden 2xl:block" />,
  ];
});

export default component$(() => {
  return (
    <div class="bg-grid-stars">
      <Header />
      <main class="relative space-y-10 flex flex-col items-center overflow-x-clip mx-auto px-4 overflow-hidden">
        {/* Design spacer. TODO: adjust as needed for responsiveness */}
        <Spacer class="2xl:h-[254px] h-[64px]" />
        <Decor />
        <div class="absolute right-0 translate-x-[60%] translate-y-[130%] 2xl:translate-x-[60%] 2xl:translate-y-[50%] rounded-full size-[300px] 2xl:size-[1054px] bg-secondary-background-base -z-10 opacity-50"></div>
        <Rocket class="absolute right-0 bottom-0 2xl:scale-100 scale-50 -translate-x-5 translate-y-15 2xl:-translate-y-10 2xl:-translate-x-[135%]" />

        <div class="container max-w-[975px] relative">
          <Clouds />
          <div class=" text-foreground-base flex flex-col items-center justify-center">
            <h1 class="text-h1 font-display">404</h1>
            <p class="text-h5 font-heading mt-4">Page not found</p>
            <p class="text-body-sm mt-10">Your rocket landed on the wrong planet.</p>
            <Link variant="primary" class="mt-10" href="/">
              <lucide.house class="size-4" />
              Back to home
            </Link>
          </div>
        </div>
        <Spacer class="2xl:h-[254px] h-[64px]" />
      </main>
      <Footer />
    </div>
  );
});
