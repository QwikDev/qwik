import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const message = useSignal('');
  return (
    <section class="fixture" data-fixture="harness/import-chain">
      <h2>harness: 3 chained import()s</h2>
      <button
        data-testid="trigger"
        onClick$={async () => {
          const { runA } = await import('./chain-a');
          message.value = await runA();
        }}
      >
        Run
      </button>
      <output data-testid="result" data-done={message.value ? '' : undefined}>
        {message.value}
      </output>
    </section>
  );
});
