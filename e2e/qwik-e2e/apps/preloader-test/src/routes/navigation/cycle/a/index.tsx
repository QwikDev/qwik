import { component$, useSignal } from '@qwik.dev/core';
import { Link, type DocumentHead } from '@qwik.dev/router';

export default component$(() => {
  const clicks = useSignal(0);
  return (
    <section class="fixture" data-fixture="navigation/cycle-a">
      <h2>cycle, page a</h2>
      <Link href="/navigation/cycle/b/" prefetchData="off" data-testid="link-on">
        To page b
      </Link>
      <button data-testid="button" onClick$={() => clicks.value++}>
        clicked {clicks.value}
      </button>
      <output data-testid="result" data-done>
        cycle-a
      </output>
    </section>
  );
});

export const head: DocumentHead = { title: 'cycle, page a' };
