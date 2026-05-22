import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getInventory, getPrice, getProduct, type ProductInput } from './catalog.server';

export const ProductCard = component$((props: ProductInput) => {
  const product = useAsync$(getProduct, props);
  const price = useAsync$(getPrice, props);
  const inventory = useAsync$(getInventory, props);

  return (
    <Suspense fallback={<article class="card muted">Loading {props.productId}...</article>}>
      <article class="card">
        <div>
          <span class="pill">{product.value.category}</span>
          <span class="pill">{product.value.segment}</span>
        </div>
        <h2>{product.value.title}</h2>
        <p>{product.value.summary}</p>
        <strong>{price.value.price}</strong>
        <small>
          {inventory.value.label} ({inventory.value.count}) | resource reads: {product.value.reads}
        </small>
      </article>
    </Suspense>
  );
});
