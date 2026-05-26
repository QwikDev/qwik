import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import type { ProductInput } from './products.server';
import { getInventory, getPricing, getProduct } from './products.server';

export const ProductCard = component$((props: ProductInput) => {
  // The direct server-function form is the optimized cache-registry edge this e2e protects.
  const product = useAsync$(getProduct, props);
  const pricing = useAsync$(getPricing, props);
  const inventory = useAsync$(getInventory, props);

  return (
    <Suspense fallback={<article data-test-product-card="loading">Loading product...</article>}>
      <article data-test-product-card={props.productId}>
        <h2 data-test-product-title>{product.value.title}</h2>
        <p data-test-product-segment>plan: {product.value.segment}</p>
        <p data-test-product-price>price: {pricing.value.price}</p>
        <p data-test-product-reads>product reads: {product.value.reads}</p>
        <p data-test-inventory-scope>inventory: {inventory.value.scope}</p>
      </article>
    </Suspense>
  );
});
