import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getInventory, getPrice, getProduct, type ProductInput } from './catalog.server';

export const ProductCard = component$((props: ProductInput) => {
  const product = useAsync$(getProduct, props);
  const price = useAsync$(getPrice, props);
  const inventory = useAsync$(getInventory, props);

  return (
    <Suspense
      fallback={
        <article class="min-h-48 rounded-lg border border-slate-200 bg-slate-50 p-[18px] text-slate-500 shadow-xl shadow-slate-900/5">
          Loading {props.productId}...
        </article>
      }
    >
      <article class="min-h-48 rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
        <div>
          <span class="mr-1.5 inline-block rounded-full bg-teal-50 px-2 py-1 text-xs font-bold text-teal-900">
            {product.value.category}
          </span>
          <span class="mr-1.5 inline-block rounded-full bg-teal-50 px-2 py-1 text-xs font-bold text-teal-900">
            {product.value.segment}
          </span>
        </div>
        <h2 class="mb-2 mt-3.5 text-lg font-black">{product.value.title}</h2>
        <p class="leading-6 text-slate-600">{product.value.summary}</p>
        <strong class="my-3 block text-2xl">{price.value.price}</strong>
        <small class="block text-slate-500">
          {inventory.value.label} ({inventory.value.count}) | resource reads: {product.value.reads}
        </small>
      </article>
    </Suspense>
  );
});
