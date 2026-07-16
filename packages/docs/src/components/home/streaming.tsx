import { component$, Slot, type PropsOf } from '@qwik.dev/core';
import { Button } from '~/components/action/action';
import { lucide, streamlinepixel as pixel } from '@qds.dev/ui';

export const Streaming = component$(() => {
  const streamingCards = [
    {
      title: 'Zero induced delays',
      body: 'Your app stays quick, no matter how large it gets.',
    },
    {
      title: (
        <>
          <span class="text-standalone-accent">~20s</span> quicker or more on 3G 🤯
        </>
      ),
      body: 'Time to Interactive measured on chrome 3G throttling on a few mid-size sample apps.',
    },
  ];

  const streamingHighlights = [
    'Qwik is like video streaming, but with JavaScript.',
    "There's no waiting for the entire code to be downloaded. Clicks respond instantly.",
    'You build your features - Qwik optimizes your code automatically',
  ];

  return (
    <section class="relative grid gap-10 md:grid-cols-2 2xl:gap-[80px] w-full 2xl:pt-32 pt-10 pb-20 2xl:px-20 px-4">
      <div class="flex flex-col order-1 2xl:gap-10 gap-10 max-w-fit">
        <div class="relative">
          <h2 class="relative z-2 font-heading 2xl:text-h3 text-[28px] box-decoration-clone">
            <span class="bg-secondary-background-base mb-2 block w-fit shadow-primary-accent">
              Introducing
            </span>
            <span class="bg-secondary-background-base shadow-primary-accent">
              JavaScript Streaming
            </span>
          </h2>
          <pixel.videomoviesplayer class="absolute -top-[55%] right-[40%] 2xl:-top-[20%] 2xl:right-[25%] z-1 size-20 rotate-14 text-border-base drop-shadow-[6px_6px_0_var(--color-shadow-emphasis)]" />
        </div>

        <div class="flex flex-col gap-6">
          {streamingHighlights.map((highlight, index) => (
            <p key={highlight} class={index === 1 ? 'max-w-[50ch]' : 'w-fit'}>
              <span class="shadow-sm-base 2xl:text-body-md text-body-sm">{highlight}</span>
            </p>
          ))}
        </div>

        <Button class="w-fit 2xl:text-base text-sm" variant="primary">
          <span>Discover more</span>
          <lucide.arrowright />
        </Button>
      </div>
      <div class="flex flex-col order-0">
        {streamingCards.map((card, index) => (
          <Card
            key={card.body}
            class={
              index === 0
                ? 'self-end z-1 2xl:shadow-emphasis shadow-sm-emphasis 2xl:mr-[128px] mr-20'
                : 'self-end transform -translate-y-10 2xl:-translate-y-16 2xl:ml-32 z-0 2xl:shadow-emphasis shadow-sm-emphasis'
            }
          >
            <div class="2xl:p-10 p-6 flex flex-col gap-2 2xl:max-w-[48ch] max-w-[260px] text-center">
              <h3 class="font-heading 2xl:text-h5 text-label-xs">{card.title}</h3>
              <p class="2xl:text-body text-body-xs">{card.body}</p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
});

export const Card = component$(({ class: className, ...rest }: PropsOf<'div'>) => {
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
});
