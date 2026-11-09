import { component$, useSignal, useTask$, type ReadonlySignal } from '@qwik.dev/core';

export const NavTreeGrandchild = component$<{ input: ReadonlySignal<number> }>(({ input }) => {
  const out = useSignal(0);
  useTask$(({ track }) => {
    out.value = track(input) * 2;
  });
  return (
    <output data-testid="result" data-done={out.value ? '' : undefined}>
      {out.value}
    </output>
  );
});
