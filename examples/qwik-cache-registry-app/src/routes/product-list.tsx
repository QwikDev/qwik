import { component$ } from '@qwik.dev/core';
import { ProductCard } from './product-card';

export const ProductList = component$((props: { ids: string[] }) => {
  return (
    <section>
      {props.ids.map((productId) => (
        <ProductCard key={productId} productId={productId} />
      ))}
    </section>
  );
});
