import { component$ } from '@qwik.dev/core';
import { PricingBadge } from './pricing-badge';
import { ProductCard } from './product-card';

export const ProductPagePartial = component$((props: { productId: string }) => {
  return (
    <section data-product-page={props.productId}>
      <h2>{props.productId === 'keyboard' ? 'Keyboard detail' : 'Mouse detail'}</h2>
      <ProductCard productId={props.productId} />
      <PricingBadge productId={props.productId} />
    </section>
  );
});
