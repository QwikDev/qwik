import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { PricingBadge } from './pricing-badge';
import { ProductCard } from './product-card';

export default component$(() => {
  return (
    <main class="mx-auto max-w-[960px] px-[18px] py-10 text-slate-900">
      <a
        class="mb-3.5 inline-flex font-extrabold text-slate-900 no-underline"
        href="http://127.0.0.1:4300/"
      >
        Example gallery
      </a>
      <section class="mb-4 rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
        <p class="mb-2 text-xs font-extrabold uppercase tracking-wide text-blue-700">
          Existing prototype
        </p>
        <h1 class="m-0 text-4xl font-black tracking-normal md:text-5xl">qcomponent partials</h1>
      </section>
      <ProductCard productId="keyboard" />
      <PricingBadge productId="keyboard" />
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik qcomponent Partials App',
};
