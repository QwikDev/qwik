import { component$, Suspense, useAsync$, useSignal } from '@qwik.dev/core';
import { getSharedMetric, getStressItem, type StressInput } from './stress.server';

export const StressCard = component$((props: StressInput) => {
  const expanded = useSignal(false);
  const item = useAsync$(getStressItem, props);
  const metric = useAsync$(getSharedMetric, props);

  return (
    <Suspense
      fallback={
        <article class="min-h-44 rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-500 shadow-xl shadow-slate-900/5">
          Loading {props.id}...
        </article>
      }
    >
      <article class="min-h-44 rounded-lg border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/5">
        <div class="flex items-center justify-between text-slate-500">
          <span>{item.value.bucket}</span>
          <button
            class="rounded-md border border-slate-300 bg-white px-2 py-1"
            onClick$={() => (expanded.value = !expanded.value)}
          >
            {expanded.value ? 'Hide' : 'Show'}
          </button>
        </div>
        <h2 class="mb-2 mt-4 text-xl font-black">{item.value.label}</h2>
        <p class="my-1.5 text-slate-600">item reads: {item.value.reads}</p>
        <p class="my-1.5 text-slate-600">metric score: {metric.value.score}</p>
        {expanded.value ? <small>metric reads: {metric.value.reads}</small> : null}
      </article>
    </Suspense>
  );
});

export const NestedStressPanel = component$((props: { runId: string; delayMs?: number }) => {
  return (
    <Suspense
      fallback={
        <section class="mb-3.5 rounded-lg border border-slate-200 bg-slate-50 p-[18px] text-slate-500 shadow-xl shadow-slate-900/5">
          Loading nested panel...
        </section>
      }
    >
      <section class="mb-3.5 rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
        <h2 class="text-2xl font-black">Nested Suspense cluster</h2>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          <StressCard id="a" runId={props.runId} delayMs={props.delayMs} />
          <StressCard id="slow" runId={props.runId} delayMs={props.delayMs} />
          <StressCard id="a" runId={props.runId} delayMs={props.delayMs} />
        </div>
      </section>
    </Suspense>
  );
});
