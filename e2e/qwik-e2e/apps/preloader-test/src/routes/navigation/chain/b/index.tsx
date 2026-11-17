import { component$, useSignal } from '@qwik.dev/core';
import { Link, type DocumentHead } from '@qwik.dev/router';

export default component$(() => {
  const clicks = useSignal(0);
  return (
    <section class="fixture" data-fixture="navigation/chain-b">
      <h2>chain, page b</h2>
      <Link href="/navigation/chain/c/" prefetchData="off" data-testid="link-on">
        To page c
      </Link>
      <button data-testid="button" onClick$={() => clicks.value++}>
        clicked {clicks.value}
      </button>
      <output data-testid="result" data-done>
        chain-b
      </output>
    </section>
  );
});

export const head: DocumentHead = { title: 'chain, page b' };
