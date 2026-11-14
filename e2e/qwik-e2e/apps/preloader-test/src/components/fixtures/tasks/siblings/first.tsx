import { component$, useSignal, useTask$, type Signal } from '@qwik.dev/core';

export const First = component$<{ input: Signal<number> }>(({ input }) => {
  const out = useSignal(0);
  useTask$(({ track }) => {
    const n = track(input);
    out.value = n && n + 1;
  });
  return <span class="step">first: {out.value}</span>;
});
