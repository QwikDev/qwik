import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';

type Demo = {
  title: string;
  port: number;
  stage: string;
  description: string;
  proves: string[];
};

const demos: Demo[] = [
  {
    title: 'Commerce Storefront',
    port: 4311,
    stage: 'Big example',
    description:
      'Product grid with repeated products, shopper segments, pricing, inventory, recommendations, server$ RPC, and registered ProductCard partials.',
    proves: [
      'server$ result dedupe',
      'component HTML varies by shopper segment',
      'data-plus-render-symbol shape',
    ],
  },
  {
    title: 'Multi-Tenant Dashboard',
    port: 4312,
    stage: 'Big example',
    description:
      'Private tenant dashboard with revenue, customers, alerts, and policy-sensitive component boundaries.',
    proves: ['private vary keys', 'tenant scoped resources', 'mixed dashboard widgets'],
  },
  {
    title: 'Partial Router Shell',
    port: 4313,
    stage: 'Big example',
    description:
      'SPA-like shell that swaps standalone qcomponent partials and can request either HTML or data-plus-render-symbol payloads.',
    proves: ['standalone partial navigation', 'HTML vs data payloads', 'resume boundary clarity'],
  },
  {
    title: 'Cache Torture Lab',
    port: 4314,
    stage: 'Stress example',
    description:
      'Dense grid of repeated async component edges, nested Suspense, signals, and intentionally mixed cacheable and normal SSR work.',
    proves: ['fan-out pressure', 'request dedupe pressure', 'signal metadata in cached components'],
  },
  {
    title: 'Component Host Prototype',
    port: 4315,
    stage: 'Future-facing example',
    description:
      'Host-style page that fetches registered component partials as standalone Qwik containers and data envelopes.',
    proves: ['fetchable component registry', 'local data preview', 'trusted component host shape'],
  },
  {
    title: 'Small Cache Registry App',
    port: 4321,
    stage: 'Existing prototype',
    description:
      'Small original product-card cache-registry demo kept as the simplest example of the model.',
    proves: ['minimal direct useAsync$(serverFn, props)', 'component cache basics'],
  },
  {
    title: 'QComponent Partials App',
    port: 4322,
    stage: 'Existing prototype',
    description: 'Focused qcomponent partial payload playground with scriptable fetch helpers.',
    proves: ['qcomponent endpoint', 'partial envelope metadata'],
  },
  {
    title: 'Partial Navigation App',
    port: 4323,
    stage: 'Existing prototype',
    description:
      'Earlier partial-navigation playground used to validate HTML and data payload modes.',
    proves: ['partial navigation sketch', 'standalone qcomponent container merge limits'],
  },
];

export default component$(() => {
  return (
    <main class="mx-auto max-w-[1180px] px-5 py-12 text-slate-900">
      <section class="mb-7 max-w-3xl">
        <p class="mb-2.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
          Qwik v2 cache-registry prototype
        </p>
        <h1 class="m-0 text-4xl font-black leading-none tracking-normal md:text-6xl">
          Example gallery
        </h1>
        <p class="mt-5 text-lg leading-8 text-slate-600">
          Each card opens a running local example. The big examples are intentionally shaped like
          real product surfaces so the cache registry has to handle SSR, server resources,
          qcomponent partials, request vary rules, and resumability metadata together.
        </p>
      </section>

      <section
        class="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4"
        aria-label="Cache registry examples"
      >
        {demos.map((demo) => (
          <article
            class="flex min-h-80 flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5"
            key={demo.title}
          >
            <div class="flex items-center justify-between gap-3 text-sm text-slate-500">
              <span>{demo.stage}</span>
              <code>:{demo.port}</code>
            </div>
            <h2 class="mb-2 mt-5 text-xl font-black">{demo.title}</h2>
            <p class="m-0 leading-6 text-slate-600">{demo.description}</p>
            <ul class="mb-5 mt-4 list-disc space-y-1.5 pl-5 text-slate-700">
              {demo.proves.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <a
              class="mt-auto inline-flex justify-center rounded-md bg-slate-800 px-4 py-2.5 font-bold text-white no-underline"
              href={`http://127.0.0.1:${demo.port}/`}
            >
              View demo
            </a>
          </article>
        ))}
      </section>
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Cache Examples Gallery',
};
