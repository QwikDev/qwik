import { component$, useSignal, useTask$, type Signal } from '@qwik.dev/core';

export const Child = component$<{ input: Signal<number> }>(({ input }) => {
  const out = useSignal(0);
  useTask$(({ track }) => {
    const n = track(input);
    out.value = n && n + 1;
  });
  return (
    <output data-testid="result" data-done={out.value ? '' : undefined}>
      {out.value}
    </output>
  );
});
