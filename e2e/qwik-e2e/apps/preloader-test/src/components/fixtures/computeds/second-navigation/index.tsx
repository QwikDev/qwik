import { component$, useComputed$, useSignal } from '@qwik.dev/core';
import { PageLinks } from './page-links';
import { Summary } from './summary';

export default component$(() => {
  const items = useSignal([1, 2, 3]);
  const total = useComputed$(() => items.value.length, { serializationStrategy: 'never' });
  return (
    <section class="fixture" data-fixture="computeds/second-navigation">
      <h2>a second navigation while a click waits for a computed</h2>
      <PageLinks />
      <Summary total={total} />
    </section>
  );
});
