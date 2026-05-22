import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getPricing } from './products.server';

export const PricingBadge = component$((props: { productId: string }) => {
  const pricing = useAsync$(getPricing, props);

  return (
    <Suspense fallback={<span aria-busy="true">Checking price...</span>}>
      <aside data-product-id={props.productId}>
        <span>Pro price</span>
        <strong>{pricing.value.price}</strong>
      </aside>
    </Suspense>
  );
});
