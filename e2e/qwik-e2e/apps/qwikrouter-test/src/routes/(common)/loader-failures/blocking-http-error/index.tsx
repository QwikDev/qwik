import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import { HttpError } from '@qwik.dev/router/middleware/request-handler';

export const useProduct = routeLoader$((): string => {
  throw new HttpError(404, 'No such product');
});

export default component$(() => {
  const product = useProduct();
  return <p id="product">{product.value}</p>;
});
