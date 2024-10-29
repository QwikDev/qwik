import { routeLoader$ } from '@qwik.dev/router';

export const useProductDetails = routeLoader$(async (requestEvent) => {
  const res = await fetch(`https://.../products/\${requestEvent.params.productId}`);
  const product = await res.json();
  return product as {};
});
