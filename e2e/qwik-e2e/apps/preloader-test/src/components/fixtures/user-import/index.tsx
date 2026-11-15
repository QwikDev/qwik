import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const message = useSignal('');
  return (
    <section class="fixture" data-fixture="user-import">
      <h2>user import</h2>
      <button
        data-testid="trigger"
        onClick$={async () => {
          const lib = await import('~/vendor-lib/libA');
          message.value = lib.getMessage();
        }}
      >
        Load
      </button>
      <output data-testid="result" data-done={message.value ? '' : undefined}>
        {message.value}
      </output>
    </section>
  );
});
