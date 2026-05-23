import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getRecommendations } from './catalog.server';
import { ProductCard } from './product-card';

export const RecommendationRail = component$(
  (props: { productId: string; runId: string; delayMs?: number }) => {
    const recommendations = useAsync$(getRecommendations, props);

    return (
      <Suspense
        fallback={
          <section class="mt-4 min-h-48 rounded-lg border border-slate-200 bg-slate-50 p-5 text-slate-500 shadow-xl shadow-slate-900/5">
            Loading recommendations...
          </section>
        }
      >
        <section class="mt-4 min-h-48 rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5">
          <div class="mb-3 mt-0 flex items-end justify-between gap-3 text-slate-600">
            <h2 class="m-0 text-2xl font-black text-slate-900">Recommended next</h2>
            <span class="text-sm">reads: {recommendations.value.reads}</span>
          </div>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5">
            {recommendations.value.ids.map((productId) => (
              <ProductCard
                key={productId}
                productId={productId}
                runId={props.runId}
                delayMs={props.delayMs}
              />
            ))}
          </div>
        </section>
      </Suspense>
    );
  }
);
