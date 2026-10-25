import { Catch, component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useOrders = routeLoader$((): string[] => {
  throw new Error('loader boom');
});

const Orders = component$(() => {
  const orders = useOrders().value;
  return <p id="orders">{orders.join(',')}</p>;
});

export default component$(() => {
  return (
    <Catch fallback$={(error) => <p id="catch-fallback">caught: {error.message}</p>}>
      <Orders />
    </Catch>
  );
});
