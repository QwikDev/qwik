import { component$, useSignal } from '@qwik.dev/core';
import { Link, type DocumentHead } from '@qwik.dev/router';

export default component$(() => {
  const clicks = useSignal(0);
  return (
    <section class="fixture" data-fixture="navigation/chain-a">
      <h2>chain, page a</h2>
      <Link href="/navigation/chain/b/" prefetchData="off" data-testid="link-on">
        To page b
      </Link>
      <button data-testid="button" onClick$={() => clicks.value++}>
        clicked {clicks.value}
      </button>
      <output data-testid="result" data-done>
        chain-a
      </output>
    </section>
  );
});

export const head: DocumentHead = { title: 'chain, page a' };
