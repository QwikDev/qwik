import { component$, version } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';
import { lucide } from '@qds.dev/ui';
import { Link } from '~/components/action/action';
import { Footer } from '~/components/footer/footer';
import { Header } from '~/components/header/header';
import {
  getReleasedVersion,
  getReleaseStage,
  type ReleaseStage,
} from '~/components/roadmap/release-stage';
import GridStarBackground from '~/media/decor/grid-star-bg.svg?jsx';

const LAST_UPDATED = 'November 2026';

type Progress = 'done' | 'current' | 'upcoming' | 'exploring';

const milestones: { stage: ReleaseStage; label: string }[] = [
  { stage: 'alpha', label: 'v2 alpha' },
  { stage: 'beta', label: 'v2 beta' },
  { stage: 'rc', label: '2.0 RC' },
  { stage: 'stable', label: '2.0 stable' },
  { stage: 'minor', label: '2.x' },
  { stage: 'next-major', label: 'v3' },
];

const columns: {
  title: string;
  progress: Progress;
  items: { title: string; description: string; tags: string[] }[];
}[] = [
  {
    title: 'Shipped',
    progress: 'done',
    items: [
      {
        title: 'Faster reactivity',
        description:
          'VNodes live in memory instead of HTML comments, so updates are over 2x faster than v1.',
        tags: ['@qwik.dev/core'],
      },
      {
        title: 'Smaller HTML',
        description: 'State and the VNode tree ship as one encoded string at the end of the page.',
        tags: ['@qwik.dev/core'],
      },
      {
        title: 'Rewritten signals',
        description:
          'Signals, stores and computed values rebuilt from scratch, with async useComputed$.',
        tags: ['@qwik.dev/core'],
      },
      {
        title: 'Out-of-order streaming',
        description: 'Pending and Catch boundaries stream a fallback first and the content later.',
        tags: ['@qwik.dev/core', 'experimental'],
      },
      {
        title: 'Cacheable loaders',
        description:
          'Each routeLoader$ gets its own JSON endpoint, with cacheControl, eTag and blockSSR.',
        tags: ['@qwik.dev/router'],
      },
      {
        title: 'Vite 8 and Rolldown',
        description: 'Builds run on Rolldown, and HMR keeps signal and store values as you edit.',
        tags: ['vite'],
      },
      {
        title: 'Qwik DevTools',
        description: 'A dev overlay and browser extension to inspect signals, renders and bundles.',
        tags: ['devtools'],
      },
      {
        title: 'New APIs',
        description:
          'worker$, reactify$, useSerializer$, server-only *.server.ts files and error.tsx.',
        tags: ['@qwik.dev/core', '@qwik.dev/router'],
      },
      {
        title: 'TypeScript optimizer',
        description: 'Opt-in with tsOptimizer: true and matches the Rust optimizer on every test.',
        tags: ['optimizer'],
      },
      {
        title: 'Qwik Router',
        description: 'Qwik City becomes Qwik Router, and every package moves to @qwik.dev.',
        tags: ['@qwik.dev/router'],
      },
      {
        title: 'v1 to v2 migration',
        description: 'qwik migrate-v2 takes care of the few breaking changes for you.',
        tags: ['cli'],
      },
    ],
  },
  {
    title: 'In progress',
    progress: 'current',
    items: [
      {
        title: 'Harmonize request events',
        description:
          'Give middleware, blocking loaders, streamed loaders and actions the same ev methods.',
        tags: ['@qwik.dev/router'],
      },
      {
        title: 'Fix critical v2 bugs',
        description: 'Fix the critical and most common bugs reported against v2.',
        tags: ['@qwik.dev/core', '@qwik.dev/router'],
      },
      {
        title: 'TTI benchmark',
        description: 'Add a time-to-interactive benchmark.',
        tags: ['benchmarks'],
      },
      {
        title: 'v2 docs home page',
        description: 'A new home page for the v2 docs.',
        tags: ['docs'],
      },
    ],
  },
  {
    title: 'Next',
    progress: 'upcoming',
    items: [
      {
        title: 'TypeScript optimizer by default',
        description: 'Switch the default from the Rust optimizer to the TypeScript one.',
        tags: ['optimizer'],
      },
      {
        title: 'Vite+ support',
        description: 'Run Qwik apps on the Vite+ toolchain.',
        tags: ['vite'],
      },
      {
        title: 'Nitro for Qwik Router',
        description: 'Deploy Qwik Router apps through Nitro and its server presets.',
        tags: ['@qwik.dev/router'],
      },
      {
        title: 'Stable pending states and errors',
        description: 'Make Pending, Catch, .pending and .error stable.',
        tags: ['@qwik.dev/core'],
      },
      {
        title: 'Fewer $ wrappers',
        description: 'Remove the $ wrappers you have to write today.',
        tags: ['optimizer'],
      },
      {
        title: 'Auto-tracking after await',
        description: 'Keep tracking reactive reads that happen after an await.',
        tags: ['@qwik.dev/core'],
      },
      {
        title: 'rpc$',
        description: 'One API that merges server$ and route actions.',
        tags: ['@qwik.dev/router'],
      },
      {
        title: 'Async data without waterfalls',
        description: 'Async computed signals with no waterfalls, replacing route loaders.',
        tags: ['@qwik.dev/core', '@qwik.dev/router'],
      },
    ],
  },
  {
    title: 'Exploring',
    progress: 'exploring',
    items: [
      {
        title: 'No virtual DOM',
        description: 'Rendering without a virtual DOM.',
        tags: ['v3'],
      },
    ],
  },
];

const progressLabels: Record<Progress, string> = {
  done: 'Shipped',
  current: 'We are here',
  upcoming: 'Next',
  exploring: 'Exploring',
};

const trackBarClasses: Record<Progress, string> = {
  done: 'bg-border-base',
  current:
    'bg-[linear-gradient(180deg,var(--color-border-base)_50%,var(--color-border-disabled)_50%)] md:bg-[linear-gradient(90deg,var(--color-border-base)_50%,var(--color-border-disabled)_50%)]',
  upcoming: 'bg-border-disabled',
  exploring:
    'bg-[repeating-linear-gradient(180deg,var(--color-border-disabled)_0_8px,transparent_8px_14px)] md:bg-[repeating-linear-gradient(90deg,var(--color-border-disabled)_0_12px,transparent_12px_20px)]',
};

const trackDotClasses: Record<Progress, string> = {
  done: 'size-5 top-0.5 group-odd:-right-2.5 group-even:-left-2.5 md:-mt-7 bg-border-base border-border-emphasis',
  current:
    'size-7 -top-0.5 group-odd:-right-3.5 group-even:-left-3.5 md:-mt-8 md:-mb-1 bg-primary-background-base border-primary-border-base shadow-primary-base',
  upcoming:
    'size-5 top-0.5 group-odd:-right-2.5 group-even:-left-2.5 md:-mt-7 bg-background-base border-border-emphasis',
  exploring:
    'size-5 top-0.5 group-odd:-right-2.5 group-even:-left-2.5 md:-mt-7 bg-background-base border-dashed border-foreground-muted',
};

const columnClasses: Record<
  Progress,
  { heading: string; marker: string; card: string; tag: string }
> = {
  done: {
    heading: 'border-border-base text-foreground-emphasis',
    marker: 'bg-border-base',
    card: 'border-border-base shadow-sm-base',
    tag: 'bg-background-accent text-foreground-base',
  },
  current: {
    heading: 'border-primary-border-base text-primary-standalone-base',
    marker: 'bg-primary-background-base',
    card: 'border-primary-border-base shadow-primary-base',
    tag: 'bg-secondary-background-base text-secondary-foreground-base',
  },
  upcoming: {
    heading: 'border-border-emphasis text-foreground-emphasis',
    marker: 'border-[1.6px] border-border-emphasis',
    card: 'border-border-base shadow-sm-base',
    tag: 'bg-background-accent text-foreground-base',
  },
  exploring: {
    heading: 'border-dashed border-foreground-muted text-foreground-emphasis',
    marker: 'border-[1.6px] border-dashed border-foreground-muted',
    card: 'border-dashed border-foreground-muted',
    tag: 'bg-background-accent text-foreground-base',
  },
};

const getMilestoneProgress = (index: number, currentIndex: number): Progress => {
  if (milestones[index].stage === 'next-major') {
    return 'exploring';
  }
  if (index < currentIndex) {
    return 'done';
  }
  return index === currentIndex ? 'current' : 'upcoming';
};

const ReleaseTrack = component$(() => {
  const releasedVersion = getReleasedVersion(version);
  const currentStage = getReleaseStage(releasedVersion);
  const currentIndex = milestones.findIndex((milestone) => milestone.stage === currentStage);

  return (
    <ol class="grid grid-cols-1 md:grid-cols-6 md:gap-y-8">
      {milestones.map((milestone, index) => {
        const progress = getMilestoneProgress(index, currentIndex);
        const isCurrent = progress === 'current';
        return (
          <li
            key={milestone.stage}
            class="group relative flex w-1/2 flex-col gap-1 pb-8 last:pb-0 odd:items-end odd:pr-7 odd:text-right even:ml-[50%] even:pl-7 md:w-auto md:gap-3.5 md:p-0 md:odd:items-start md:odd:pr-0 md:odd:text-left md:even:ml-0 md:even:pl-0"
          >
            <div
              class={[
                'absolute top-0 bottom-0 w-1.5 group-odd:-right-[3px] group-even:-left-[3px] group-first:top-3 group-last:bottom-auto group-last:h-3 md:static md:h-2 md:w-full md:group-last:h-2',
                trackBarClasses[progress],
              ]}
            />
            <span
              aria-hidden="true"
              class={['absolute border-[1.6px] md:static', trackDotClasses[progress]]}
            />
            <span
              class={[
                'text-lg font-bold',
                isCurrent ? 'text-primary-standalone-base' : 'text-foreground-emphasis',
              ]}
            >
              {milestone.label}
            </span>
            <span class="text-sm text-foreground-muted">
              {progressLabels[progress]}
              {isCurrent && <span class="whitespace-nowrap">{` · v${releasedVersion}`}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
});

const RoadmapBoard = component$(() => {
  return (
    <div class="grid grid-cols-1 items-start gap-8 sm:grid-cols-2 xl:auto-cols-fr xl:grid-flow-col xl:grid-cols-none">
      {columns.map((column) => {
        const classes = columnClasses[column.progress];
        return (
          <section key={column.title} class="flex flex-col gap-5">
            <div
              class={['flex items-center justify-between border-b-[1.6px] pb-3', classes.heading]}
            >
              <h3 class="m-0 flex items-center gap-2.5 text-h6 font-bold">
                <span aria-hidden="true" class={['size-3', classes.marker]} />
                {column.title}
              </h3>
              <span class="text-sm text-foreground-muted">{column.items.length}</span>
            </div>
            {column.items.map((item) => (
              <article
                key={item.title}
                class={[
                  'flex flex-col gap-2.5 rounded-lg border-[1.6px] bg-background-base p-5',
                  classes.card,
                ]}
              >
                <h4 class="m-0 text-lg font-bold text-foreground-emphasis">{item.title}</h4>
                <p class="m-0 text-foreground-soft">{item.description}</p>
                <div class="flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <span key={tag} class={['px-2 py-0.5 text-[13px]', classes.tag]}>
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
});

export default component$(() => {
  return (
    <>
      <div class="bg-grid-stars">
        <GridStarBackground class="grid-star-background" />
        <Header />
        <main class="mx-auto flex max-w-[1280px] flex-col gap-28 px-4 pt-40 pb-32 2xl:px-0 2xl:pt-56">
          <section class="flex flex-col items-center gap-8 text-center">
            <h1 class="m-0 font-heading text-[56px] leading-[1.05] uppercase text-foreground-emphasis md:text-[96px] 2xl:text-[128px]">
              <span class="[text-shadow:0.035em_0.035em_0_var(--color-background-base),0.07em_0.07em_0_var(--color-shadow-emphasis)]">
                Road
                <span class="text-primary-standalone-base [text-shadow:0.035em_0.035em_0_var(--color-background-base),0.07em_0.07em_0_var(--color-primary-shadow-base)]">
                  map
                </span>
              </span>
            </h1>
            <p class="m-0 max-w-[52ch] text-body-sm text-foreground-soft 2xl:text-body-md">
              What has shipped, what the team is building now, and where Qwik is heading next.
            </p>
            <div class="flex flex-wrap justify-center gap-6">
              <Link href="https://github.com/QwikDev/qwik" variant="primary" class="text-sm">
                <span>Follow on GitHub</span>
                <lucide.arrowright class="size-4" />
              </Link>
              <Link href="/blog" variant="outline" class="text-sm">
                <span>Read the blog</span>
              </Link>
            </div>
          </section>

          <section aria-labelledby="release-track" class="flex flex-col gap-8">
            <h2
              id="release-track"
              class="m-0 text-center font-heading text-h5 text-foreground-emphasis md:text-left"
            >
              Release track
            </h2>
            <ReleaseTrack />
          </section>

          <section aria-labelledby="roadmap-board" class="flex flex-col gap-8">
            <div class="flex flex-wrap items-end justify-between gap-4">
              <h2 id="roadmap-board" class="m-0 font-heading text-h5 text-foreground-emphasis">
                What we're working on
              </h2>
              <p class="m-0 text-foreground-muted">
                Last updated {LAST_UPDATED} · Plans change.{' '}
                <a href="https://github.com/QwikDev/qwik" class="text-standalone-base underline">
                  Track each item on GitHub
                </a>
                .
              </p>
            </div>
            <RoadmapBoard />
          </section>

          <section class="flex flex-wrap items-center justify-between gap-8 rounded-2xl border-[1.6px] border-border-emphasis bg-background-accent px-6 py-12 shadow-emphasis md:px-12 md:py-14">
            <div class="flex max-w-[560px] flex-col gap-3">
              <h2 class="m-0 font-heading text-[32px] leading-tight text-foreground-emphasis md:text-[40px]">
                Help shape <span class="text-primary-standalone-base">what's next</span>
              </h2>
              <p class="m-0 text-foreground-soft">
                Propose an idea, vote on what matters to you, or pick up an open issue.
              </p>
            </div>
            <div class="flex flex-wrap gap-6">
              <Link
                href="https://github.com/QwikDev/qwik-evolution/discussions"
                variant="primary"
                class="text-sm"
              >
                <span>GitHub discussions</span>
              </Link>
              <Link href="https://qwik.dev/chat" variant="secondary" class="text-sm">
                <span>Join Discord</span>
              </Link>
            </div>
          </section>
        </main>
      </div>
      <Footer />
    </>
  );
});

export const head: DocumentHead = {
  title: 'Roadmap',
  meta: [
    {
      name: 'description',
      content: 'What has shipped in Qwik, what the team is building now, and what comes next.',
    },
  ],
};
