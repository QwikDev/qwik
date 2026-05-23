import { component$, useSignal } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { getProduct } from './catalog.server';
import { ProductCard } from './product-card';
import { RecommendationRail } from './recommendation-rail';

const runId = `commerce-${Date.now()}`;

export default component$(() => {
  const rpcResult = useSignal('not run');
  const ids = ['keyboard', 'mouse', 'keyboard', 'dock', 'lamp', 'dock'];

  return (
    <main class="mx-auto max-w-[1180px] px-[18px] py-10 text-slate-900">
      <a
        class="mb-3.5 inline-flex font-extrabold text-slate-900 no-underline"
        href="http://127.0.0.1:4300/"
      >
        Example gallery
      </a>
      <section class="mb-5 rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <p class="mb-2 text-xs font-extrabold uppercase tracking-wide text-emerald-700">
          Commerce Storefront
        </p>
        <h1 class="m-0 text-4xl font-black tracking-normal md:text-5xl">
          Segmented product data with cacheable cards
        </h1>
        <p class="max-w-3xl leading-7 text-slate-600">
          This page repeats products on purpose. The duplicated cards should share server resource
          work while registered card HTML can vary by shopper segment.
        </p>
        <button
          class="mr-3 rounded-md bg-slate-800 px-3.5 py-2.5 font-bold text-white"
          onClick$={async () => {
            const input = { productId: 'keyboard', runId: `${runId}-client` };
            const first = await getProduct(input);
            const second = await getProduct(input);
            rpcResult.value = `client server$ reads: ${first.reads}/${second.reads}`;
          }}
        >
          Run cached client server$
        </button>
        <span>{rpcResult.value}</span>
      </section>

      <section class="mb-3 mt-6 flex items-end justify-between gap-3 text-slate-600">
        <h2 class="m-0 text-2xl font-black text-slate-900">Product grid</h2>
        <span class="text-sm">duplicate inputs included</span>
      </section>
      <section class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        {ids.map((productId, index) => (
          <ProductCard key={`${productId}-${index}`} productId={productId} runId={runId} />
        ))}
      </section>

      <RecommendationRail productId="keyboard" runId={runId} />
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Commerce Cache Registry Example',
};
