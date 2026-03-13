import { component$, Slot, type PropsOf } from '@qwik.dev/core';
import { Button } from '~/components/action/action';
import { lucide } from '@qds.dev/ui';

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
    <section class="grid place-items-center gap-10 md:grid-cols-2 3xl:gap-20 max-w-screen-3xl mx-auto 3xl:pt-32 pt-10 pb-20 3xl:px-20 px-4 box-content">
      <div class="flex flex-col">
        {streamingCards.map((card, index) => (
          <Card
            key={card.body}
            class={
              index === 0
                ? 'z-1 3xl:shadow-emphasis shadow-sm-emphasis'
                : 'self-end transform -translate-y-10 translate-x-10 3xl:-translate-y-16 z-0 3xl:shadow-emphasis shadow-sm-emphasis'
            }
          >
            <div class="3xl:p-10 p-6 flex flex-col gap-2 3xl:max-w-[48ch] max-w-[260px] text-center">
              <h3 class="font-heading 3xl:text-h5 text-sm">{card.title}</h3>
              <p class="3xl:text-body text-sm">{card.body}</p>
            </div>
          </Card>
        ))}
      </div>

      <div class="flex flex-col 3xl:gap-10 gap-8 max-w-fit">
        <div class="relative">
          <h2 class="font-heading 3xl:text-h3 text-[28px] box-decoration-clone">
            <span class="bg-secondary-background-base mb-2 block w-fit shadow-primary-accent">
              Introducing
            </span>
            <span class="bg-secondary-background-base shadow-primary-accent box-decoration-clone leading-[140%]">
              JavaScript Streaming
            </span>
          </h2>
          <VideoPlayerIcon class="absolute left-4/7 -top-2/5 transform" />
        </div>

        <div class="space-y-6">
          {streamingHighlights.map((highlight, index) => (
            <p key={highlight} class={index === 1 ? 'max-w-[50ch]' : 'w-fit'}>
              <span class="shadow-sm-base leading-[2.5]">{highlight}</span>
            </p>
          ))}
        </div>

        <Button class="w-fit 3xl:text-base text-sm" variant="primary">
          <span>Discover more</span>
          <lucide.arrowright />
        </Button>
      </div>
    </section>
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
      <g class="fill-border-base" filter="url(#filter0_d_365_1969)">
        <path d="M90.2888 35.4864L86.5797 34.5518L75.4068 78.8907L79.1159 79.8253L90.2888 35.4864Z" />
        <path d="M75.4067 78.8908L71.7219 77.9623L70.7934 81.6471L74.4782 82.5756L75.4067 78.8908Z" />
        <path d="M87.5082 30.8669L83.8234 29.9384L82.8948 33.6232L86.5796 34.5517L87.5082 30.8669Z" />
        <path d="M70.796 81.6478L11.6936 66.7547L10.759 70.4638L69.8614 85.3568L70.796 81.6478Z" />
        <path d="M60.6983 43.7568L57.0135 42.8283L57.942 39.1434L54.2305 38.2082L55.1652 34.4991L51.4803 33.5706L52.4089 29.8858L41.3302 27.0941L32.0205 64.0392L43.0992 66.8309L44.0338 63.1218L47.7186 64.0504L48.6471 60.3656L52.3586 61.3008L53.2933 57.5917L56.9781 58.5203L57.9066 54.8355L61.589 55.7634L63.4521 48.3695L59.7698 47.4416L60.6983 43.7568Z" />
        <path d="M84.7545 26.2542L25.6521 11.3611L24.7236 15.0459L83.826 29.939L84.7545 26.2542Z" />
        <path d="M12.6197 63.0692L8.91064 62.1346L7.98212 65.8194L11.6912 66.754L12.6197 63.0692Z" />
        <path d="M24.7211 15.0453L21.0121 14.1107L20.0836 17.7955L23.7926 18.7301L24.7211 15.0453Z" />
        <path d="M20.0835 17.7955L16.3987 16.867L5.22581 61.206L8.91062 62.1345L20.0835 17.7955Z" />
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
  const dots = Array.from({ length: 3 }).map(() => (
    <div class="bg-background-base 3xl:size-3 size-2 rounded-full" />
  ));

  return (
    <div
      class={[
        'w-fit rounded-2xl border-[1.6px] border-emphasis h-fit bg-background-base',
        className,
      ]}
      {...rest}
    >
      <div class="bg-background-accent border-b-[1.6px] border-emphasis h-[27.241px] 3xl:h-11 rounded-t-2xl flex gap-2 px-3 items-center">
        {dots}
      </div>

      <Slot />
    </div>
  );
});
