import { $, component$, useContext, useSignal, type Signal } from '@qwik.dev/core';
import { TotalContext } from './context';

type HandlerRuns = { handlerRuns?: number };

export const Writer = component$<{ count: Signal<number> }>(({ count }) => {
  const totals = useContext(TotalContext);
  const shown = useSignal('');
  const readTotal = $(() => totals.total.value);
  return (
    <>
      <button
        data-testid="trigger"
        onClick$={async () => {
          const runs = globalThis as HandlerRuns;
          runs.handlerRuns = (runs.handlerRuns ?? 0) + 1;
          count.value++;
          shown.value = `${await readTotal()}`;
        }}
      >
        Count and read the total
      </button>
      <output data-testid="result" data-done={shown.value ? '' : undefined}>
        {shown.value}
      </output>
    </>
  );
});
