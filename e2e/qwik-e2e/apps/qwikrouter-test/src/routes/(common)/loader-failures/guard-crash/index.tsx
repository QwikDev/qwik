import { Catch, component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useInvoices = routeLoader$(() => 'secret invoices');

const Invoices = component$(() => <p id="invoices">{useInvoices().value}</p>);

export default component$(() => {
  return (
    <Catch fallback$={(error) => <p id="catch-fallback">caught: {error.message}</p>}>
      <Invoices />
    </Catch>
  );
});
