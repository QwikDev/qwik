import { component$, useSignal } from '@qwik.dev/core';
import { Link, type DocumentHead } from '@qwik.dev/router';

export default component$(() => {
  const clicks = useSignal(0);
  return (
    <section class="fixture" data-fixture="navigation/cycle-b">
      <h2>cycle, page b</h2>
      <Link href="/navigation/cycle/a/" prefetchData="off" data-testid="link-on">
        Back to page a
      </Link>
      <button data-testid="button" onClick$={() => clicks.value++}>
        clicked {clicks.value}
      </button>
      <output data-testid="result" data-done>
        cycle-b
      </output>
    </section>
  );
});

export const head: DocumentHead = { title: 'cycle, page b' };
