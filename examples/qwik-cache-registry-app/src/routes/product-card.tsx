import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getProduct } from './products.server';

export const ProductCard = component$((props: { productId: string }) => {
  const product = useAsync$(getProduct, props);

  return (
    <Suspense fallback={<article aria-busy="true">Loading {props.productId}...</article>}>
      <article>
        <h2>{product.value.title}</h2>
        <p>{product.value.description}</p>
        <strong>{product.value.price}</strong>
        <small>segment: {product.value.segment}</small>
        <small>resource reads: {product.value.reads}</small>
      </article>
    </Suspense>
  );
});
