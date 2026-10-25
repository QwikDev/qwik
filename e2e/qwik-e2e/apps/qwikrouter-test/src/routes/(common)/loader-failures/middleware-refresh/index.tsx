import { component$ } from '@qwik.dev/core';
import { routeLoader$, type RequestHandler } from '@qwik.dev/router';
import { HttpError } from '@qwik.dev/router/middleware/request-handler';

export const onRequest: RequestHandler = ({ cookie, cacheControl }) => {
  // The root layout's max-age would serve the refresh from the browser cache.
  cacheControl('no-cache');
  if (cookie.get('middleware-failure')?.value === 'http') {
    throw new HttpError(401, 'Signed out');
  }
};

export const useCart = routeLoader$(() => 'cart data');

export default component$(() => {
  const cart = useCart();
  return (
    <div>
      <button id="refresh-cart" onClick$={() => cart.invalidate()}>
        refresh cart
      </button>
      <p id="cart-value">{cart.value}</p>
      <p id="cart-error">{cart.error?.message}</p>
    </div>
  );
});
