import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getProduct } from './products.server';

export const ProductCard = component$(
  (props: { productId: string; runId?: string; delayMs?: number }) => {
    const product = useAsync$(getProduct, props);

    return (
      <Suspense
        fallback={
          <article
            class="mb-3.5 min-h-48 rounded-lg border border-slate-200 bg-slate-50 p-[18px] text-slate-500 shadow-xl shadow-slate-900/5"
            aria-busy="true"
          >
            Loading {props.productId}...
          </article>
        }
      >
        <article class="mb-3.5 min-h-48 rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
          <h2 class="mb-2 mt-0 text-xl font-black">{product.value.title}</h2>
          <p class="leading-6 text-slate-600">{product.value.description}</p>
          <strong class="my-3 block text-2xl">{product.value.price}</strong>
          <small class="block text-slate-500">resource reads: {product.value.reads}</small>
        </article>
      </Suspense>
    );
  }
);
