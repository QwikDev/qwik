import { component$, useComputed$, useSignal, useTask$ } from '@qwik.dev/core';

export const ModalContent = component$(() => {
  const input = useSignal(1);
  const incremented = useComputed$(() => input.value && input.value + 1);
  const out = useSignal(0);

  useTask$(({ track }) => {
    const n = track(incremented);
    out.value = n && n + 1;
  });

  return (
    <output data-testid="result" data-done={out.value ? '' : undefined}>
      {out.value}
    </output>
  );
});
