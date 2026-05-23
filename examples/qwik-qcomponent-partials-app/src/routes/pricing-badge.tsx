import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getPricing } from './products.server';

export const PricingBadge = component$((props: { productId: string }) => {
  const pricing = useAsync$(getPricing, props);

  return (
    <Suspense
      fallback={
        <span
          class="inline-flex rounded-full bg-slate-100 px-3 py-1 text-slate-500"
          aria-busy="true"
        >
          Checking price...
        </span>
      }
    >
      <aside
        class="inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-xl shadow-slate-900/5"
        data-product-id={props.productId}
      >
        <span class="font-bold text-slate-500">Pro price</span>
        <strong class="text-xl">{pricing.value.price}</strong>
      </aside>
    </Suspense>
  );
});
