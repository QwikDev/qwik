import { component$, useSignal } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';
import { ProductCard } from './product-card';
import { getProduct } from './products.server';

export default component$(() => {
  const location = useLocation();
  const runId = location.url.searchParams.get('run') ?? 'default';
  const clientResult = useSignal('');
  const clientInput = {
    productId: 'client',
    runId,
  };

  return (
    <main>
      <h1>Cache registry e2e</h1>
      <p data-test-page-run>{runId}</p>

      <section aria-label="duplicate products">
        <div data-test-card-wrapper="first">
          <ProductCard productId="keyboard" runId={runId} />
        </div>
        <div data-test-card-wrapper="second">
          <ProductCard productId="keyboard" runId={runId} />
        </div>
      </section>

      <section aria-label="normal component">
        <UnregisteredCard />
      </section>

      <button
        id="client-rpc-button"
        onClick$={async () => {
          const first = await getProduct(clientInput);
          const second = await getProduct(clientInput);
          clientResult.value = `client reads: ${first.reads}/${second.reads}`;
        }}
      >
        Run client server$
      </button>
      <p id="client-rpc-result">{clientResult.value}</p>
    </main>
  );
});

const UnregisteredCard = component$(() => {
  return <p data-test-unregistered-card>normal Qwik SSR still renders</p>;
});
