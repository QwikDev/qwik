import { component$ } from '@qwik.dev/core';
import { PricingBadge } from './pricing-badge';
import { ProductCard } from './product-card';

export const ProductPagePartial = component$((props: { productId: string }) => {
  return (
    <section class="rounded-lg bg-slate-50 p-4" data-product-page={props.productId}>
      <h2 class="mb-4 text-2xl font-black">
        {props.productId === 'keyboard' ? 'Keyboard detail' : 'Mouse detail'}
      </h2>
      <ProductCard productId={props.productId} />
      <PricingBadge productId={props.productId} />
    </section>
  );
});
