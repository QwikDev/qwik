import { component$ } from '@qwik.dev/core';
import { ProductCard } from './product-card';

export const ProductList = component$((props: { ids: string[] }) => {
  return (
    <section class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
      {props.ids.map((productId) => (
        <ProductCard key={productId} productId={productId} />
      ))}
    </section>
  );
});
