import { component$, useSignal } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';

export default component$(() => {
  const clicks = useSignal(0);
  return (
    <section class="fixture" data-fixture="navigation/chain-c">
      <h2>chain, page c</h2>
      <button data-testid="button" onClick$={() => clicks.value++}>
        clicked {clicks.value}
      </button>
      <output data-testid="result" data-done>
        chain-c
      </output>
    </section>
  );
});

export const head: DocumentHead = { title: 'chain, page c' };
