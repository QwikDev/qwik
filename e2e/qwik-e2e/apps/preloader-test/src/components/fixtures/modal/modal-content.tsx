import { component$, useComputed$, useSignal, useTask$ } from '@qwik.dev/core';

export const ModalContent = component$(() => {
  const input = useSignal(1);
  const doubled = useComputed$(() => input.value * 2);
  const out = useSignal(0);

  useTask$(({ track }) => {
    out.value = track(doubled) * 2;
  });

  return (
    <output data-testid="result" data-done={out.value ? '' : undefined}>
      {out.value}
    </output>
  );
});
