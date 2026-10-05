import { component$, Slot, type PropsOf } from '@qwik.dev/core';
import { Link } from '~/components/action/action';
import { lucide, streamlinepixel as pixel } from '@qds.dev/ui';
import TimeToInteractive from '~/media/home/time-to-interactive.png?jsx';

export const Streaming = component$(() => {
  const streamingHighlights = [
    'Qwik is like video streaming, but with JavaScript.',
    "There's no waiting for the entire code to be downloaded. Clicks respond instantly.",
    'You build your features - Qwik optimizes your code automatically',
  ];

  return (
    <section class="relative overflow-x-clip grid gap-10 md:grid-cols-[auto_max-content] md:justify-center md:gap-16 2xl:gap-[80px] w-full max-w-[1280px] mx-auto 2xl:pt-40 md:pt-24 pt-16 pb-20 2xl:px-20 px-4">
      <div class="flex flex-col 2xl:gap-10 gap-10 max-w-fit">
        <div class="relative">
          <h2 class="relative z-2 font-heading 2xl:text-h3 text-[28px] box-decoration-clone">
            <span class="bg-secondary-background-base mb-2 block w-fit whitespace-nowrap shadow-primary-accent">
              Introducing
            </span>
            <span class="bg-secondary-background-base whitespace-nowrap shadow-primary-accent">
              JavaScript Streaming
            </span>
          </h2>
          <pixel.videomoviesplayer class="absolute -top-[55%] right-[40%] md:right-6 md:-top-[42%] z-1 size-20 -rotate-14 text-border-base drop-shadow-[6px_6px_0_var(--color-shadow-emphasis)]" />
        </div>

        <div class="flex flex-col gap-6">
          {streamingHighlights.map((highlight, index) => (
            <p key={highlight} class={index === 1 ? 'max-w-[50ch]' : 'w-fit'}>
              <span class="shadow-sm-base 2xl:text-body-md text-body-sm">
                {highlight}
              </span>
            </p>
          ))}
        </div>
      </div>
      <div class="relative flex flex-col items-center 2xl:gap-10 gap-8 w-full max-w-[440px] md:w-auto md:max-w-none">
        <div class="absolute -z-2 -inset-x-1/3 -inset-y-1/2 bg-hero-gradient-purple opacity-50" />
        <TimeToInteractive
          alt="Time to interactive grows with app size in frameworks that hydrate, and stays flat with Qwik's JavaScript streaming."
          class="w-full md:w-[380px] lg:w-[430px] 2xl:w-[500px] h-auto md:my-auto [html.dark_&]:invert [html.dark_&]:hue-rotate-180"
          sizes="(min-width: 90rem) 500px, 440px"
        />
        <Link
          href="/docs/concepts/think-qwik/"
          class="w-fit 2xl:text-base text-sm"
          variant="primary"
        >
          <span>Discover more</span>
          <lucide.arrowright />
        </Link>
      </div>
    </section>
  );
});

export const Card = component$(
  ({ class: className, ...rest }: PropsOf<'div'>) => {
    const dots = Array.from({ length: 3 }).map(() => (
      <div class="bg-background-base 2xl:size-3 size-2 rounded-full" />
    ));

    return (
      <div
        class={[
          'w-fit rounded-2xl border-[1.6px] border-emphasis h-fit bg-background-base',
          className,
        ]}
        {...rest}
      >
        <div class="bg-background-accent border-b-[1.6px] border-emphasis h-[27.241px] 2xl:h-11 rounded-t-2xl flex gap-2 px-3 items-center">
          {dots}
        </div>

        <Slot />
      </div>
    );
  }
);
