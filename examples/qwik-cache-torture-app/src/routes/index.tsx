import { component$ } from '@qwik.dev/core';
import { type DocumentHead, useLocation } from '@qwik.dev/router';
import { DemoModePanel, readDemoMode } from '../../../qwik-cache-demo-utils/demo-mode';
import { NestedStressPanel, StressCard } from './stress-card';

const ids = ['a', 'b', 'c', 'a', 'd', 'slow', 'b', 'e', 'f', 'a', 'slow', 'c'];

export default component$(() => {
  const location = useLocation();
  const demo = readDemoMode(location.url, 'torture');

  return (
    <main class="mx-auto max-w-[1220px] px-[18px] py-10 text-slate-900">
      <a
        class="mb-3.5 inline-flex font-extrabold text-slate-900 no-underline"
        href="http://127.0.0.1:4300/"
      >
        Example gallery
      </a>
      <DemoModePanel demo={demo} port={4314} />
      <section class="mb-3.5 rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <p class="mb-2 text-xs font-extrabold uppercase tracking-wide text-amber-700">
          Cache Torture Lab
        </p>
        <h1 class="m-0 text-4xl font-black tracking-normal md:text-5xl">
          Repeated async edges, nested Suspense, and signals
        </h1>
        <p class="max-w-3xl leading-7 text-slate-600">
          This fixture is intentionally dense. It repeats inputs, mixes local signals into cacheable
          components, and keeps one normal SSR widget outside the registry.
        </p>
      </section>

      <section class="mb-3.5 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        {ids.map((id, index) => (
          <StressCard key={`${id}-${index}`} id={id} runId={demo.runId} delayMs={demo.delayMs} />
        ))}
      </section>
      <NestedStressPanel runId={demo.runId} delayMs={demo.delayMs} />
      <NormalSsrWidget />
    </main>
  );
});

const NormalSsrWidget = component$(() => {
  return (
    <section class="mb-3.5 rounded-lg border border-dashed border-slate-300 bg-white p-[18px] shadow-xl shadow-slate-900/5">
      <h2 class="text-2xl font-black">Normal SSR fallback area</h2>
      <p>This component is not registered in cache config. It should render normally.</p>
    </section>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Cache Torture Example',
};
