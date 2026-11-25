import { component$, useSignal, type ReadonlySignal } from '@qwik.dev/core';

type HandlerRuns = { handlerRuns?: number };

export const Summary = component$<{ total: ReadonlySignal<number> }>(({ total }) => {
  const shown = useSignal('');
  return (
    <>
      <button
        data-testid="trigger"
        onClick$={() => {
          const runs = globalThis as HandlerRuns;
          runs.handlerRuns = (runs.handlerRuns ?? 0) + 1;
          shown.value = `${total.value}`;
        }}
      >
        Read the total
      </button>
      <output data-testid="result" data-done={shown.value ? '' : undefined}>
        {shown.value}
      </output>
    </>
  );
});
