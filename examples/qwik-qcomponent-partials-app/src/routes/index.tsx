import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { PricingBadge } from './pricing-badge';
import { ProductCard } from './product-card';

export default component$(() => {
  return (
    <main>
      <h1>qcomponent partials</h1>
      <ProductCard productId="keyboard" />
      <PricingBadge productId="keyboard" />
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik qcomponent Partials App',
};
