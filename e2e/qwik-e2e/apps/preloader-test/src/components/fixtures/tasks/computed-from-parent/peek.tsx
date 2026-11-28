import { $, component$, useSignal, type Signal } from '@qwik.dev/core';

export const Peek = component$<{ count: Signal<number> }>(({ count }) => {
  const seen = useSignal('');
  const read = $(() => {
    seen.value = `count is ${count.value}`;
  });
  return (
    <>
      <button data-testid="read" onClick$={() => read()}>
        Read count
      </button>
      <output data-testid="read-result" data-done={seen.value ? '' : undefined}>
        {seen.value}
      </output>
    </>
  );
});
