import { component$, useSignal } from '@qwik.dev/core';
import { Button } from '~/components/action/action';
import { Card } from './streaming';

type Level = {
  title: string;
  subtitle: string;
  description: string;
  file: string;
  code: string;
};

const levels: Level[] = [
  {
    title: 'Familiar',
    subtitle: "The good ol' SPA DX you're used to — without the startup tax.",
    description:
      'Start with components, signals, events, and async data. The syntax is familiar, so you can focus on what the app does before learning what makes Qwik different.',
    file: 'src/routes/jokes/index.tsx',
    code: `import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const joke = useSignal(initialJoke);

  return (
    <div class="jokeApp">
      <h1>Jokes</h1>
      <p>{joke.value.setup}</p>
      <p>{joke.value.punchline}</p>

      <button
        onClick$={async () => {
          joke.value = await getJoke();
        }}
      >
        Get another joke
      </button>
    </div>
  );
});`,
  },
  {
    title: 'Resumable',
    subtitle: 'See when JavaScript is needed instead of paying for it up front.',
    description:
      'Keep the same component model, then learn the Qwik mental model: serialized state, lazy execution, and code that is requested when an interaction actually needs it.',
    file: 'src/routes/jokes/index.tsx',
    code: `import {
  component$,
  useComputed$,
  useSignal,
} from '@qwik.dev/core';

export default component$(() => {
  const query = useSignal('');

  const jokes = useComputed$(async ({ abortSignal }) => {
    const response = await fetch(
      createJokeUrl(query.value),
      { signal: abortSignal },
    );

    return response.json();
  });

  return <JokeResults jokes={jokes} />;
});`,
  },
  {
    title: 'Full app',
    subtitle: 'Routes, loaders, actions, and forms without changing the mental model.',
    description:
      'Move from a component demo to an application. Qwik Router adds file-based routing and server primitives while the UI stays component-first.',
    file: 'src/routes/jokes/index.tsx',
    code: `import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useJoke = routeLoader$(async () => {
  return getJoke();
});

export default component$(() => {
  const joke = useJoke();

  return (
    <main>
      <h1>Jokes</h1>
      <p>{joke.value.setup}</p>
      <p>{joke.value.punchline}</p>
    </main>
  );
});`,
  },
];

const jokes = [
  {
    setup: 'What is the difference between ignorance and apathy?',
    punchline: "I don't know and I don't care.",
  },
  {
    setup: 'Why did the developer go broke?',
    punchline: 'Because they used up all their cache.',
  },
  {
    setup: 'Why do programmers prefer dark mode?',
    punchline: 'Because light attracts bugs.',
  },
];

export const LevelUp = component$(() => {
  const activeLevel = useSignal(0);
  const jokeIndex = useSignal(0);
  const level = levels[activeLevel.value];
  const joke = jokes[jokeIndex.value];

  return (
    <section class="relative mx-auto w-full px-4 py-20 2xl:px-20 2xl:py-32">
      <div class="mx-auto mb-12 flex max-w-[70ch] flex-col items-center gap-4 text-center">
        <p class="text-primary-standalone-emphasis text-label-sm font-semibold uppercase tracking-wide">
          Leveling up
        </p>
        <h2 class="font-heading text-[32px] 2xl:text-h3">Learn Qwik one idea at a time</h2>
        <p class="text-body-sm 2xl:text-body-md">
          Qwik and Qwik Router combine familiar components, state, routing, loaders, actions, and
          more. Start with what you already know, then reveal the resumability model as you need it.
        </p>
      </div>

      <div class="mx-auto grid max-w-[1400px] gap-6 lg:grid-cols-[170px_minmax(0,1fr)] lg:items-start">
        <nav class="flex gap-3 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible" aria-label="Qwik learning levels">
          {levels.map((item, index) => (
            <button
              key={item.title}
              type="button"
              onClick$={() => {
                activeLevel.value = index;
              }}
              aria-pressed={activeLevel.value === index}
              class={[
                'min-w-[150px] rounded-full border-[1.6px] px-4 py-2 text-left text-label-xs transition-transform hover:-translate-y-0.5 lg:w-full',
                activeLevel.value === index
                  ? 'border-secondary-border-base bg-secondary-background-base text-secondary-foreground-base shadow-sm-base'
                  : 'border-base bg-background-base text-foreground-soft',
              ]}
            >
              <span class="flex items-center justify-between gap-3">
                <span>Level {index + 1}</span>
                <span class="text-primary-standalone-emphasis" aria-hidden="true">
                  {Array.from({ length: index + 1 }, () => '◆').join(' ')}
                </span>
              </span>
            </button>
          ))}
        </nav>

        <div class="relative pb-36 sm:pb-28 lg:pb-20">
          <Card class="w-full shadow-emphasis">
            <div class="flex flex-col gap-3 border-b-[1.6px] border-base px-5 py-6 2xl:px-8">
              <p class="text-primary-standalone-emphasis text-label-xs font-semibold">
                Level {activeLevel.value + 1}: {level.title}
              </p>
              <h3 class="font-heading text-[26px] 2xl:text-h5">{level.subtitle}</h3>
              <p class="max-w-[80ch] text-body-xs text-foreground-soft 2xl:text-body-sm">
                {level.description}
              </p>
            </div>

            <div class="grid min-h-[430px] md:grid-cols-[220px_minmax(0,1fr)]">
              <div class="hidden border-r-[1.6px] border-base bg-background-accent/40 p-5 text-body-xs md:block">
                <p class="mb-3 text-label-xs font-semibold">Project</p>
                <ul class="space-y-2 text-foreground-soft">
                  <li>⌄ src</li>
                  <li class="pl-4">⌄ routes</li>
                  <li class="pl-8">⌄ jokes</li>
                  <li class="pl-12 text-primary-standalone-emphasis">⚙ index.tsx</li>
                </ul>
              </div>

              <div class="min-w-0 bg-background-base">
                <div class="border-b-[1.6px] border-base px-5 py-3 text-body-xs text-foreground-soft">
                  {level.file}
                </div>
                <pre class="m-0 overflow-x-auto p-5 text-[12px] leading-6 2xl:p-8 2xl:text-sm">
                  <code>{level.code}</code>
                </pre>
              </div>
            </div>
          </Card>

          <div class="absolute -bottom-2 left-4 right-4 rounded-2xl border-[1.6px] border-emphasis bg-background-base p-5 shadow-emphasis sm:left-8 sm:right-auto sm:w-[390px] lg:-bottom-8 lg:-left-10">
            <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h4 class="font-heading text-label-sm">Jokes</h4>
              <Button
                variant="outline"
                class="text-body-xs"
                onClick$={() => {
                  jokeIndex.value = (jokeIndex.value + 1) % jokes.length;
                }}
              >
                Get another joke
              </Button>
            </div>
            <div class="space-y-4 text-body-sm">
              <p>{joke.setup}</p>
              <p class="font-semibold">{joke.punchline}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});
