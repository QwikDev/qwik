import { component$, useSignal, type ReadonlySignal } from '@qwik.dev/core';

type Row = { label: string; total: ReadonlySignal<number> };
type HandlerRuns = { handlerRuns?: number };

export const List = component$<{ rows: Row[] }>(({ rows }) => {
  const shown = useSignal('');
  const rowCount = useSignal('');
  return (
    <>
      {rows.map((row) => (
        <button
          key={row.label}
          data-testid="trigger"
          onClick$={() => {
            const runs = globalThis as HandlerRuns;
            runs.handlerRuns = (runs.handlerRuns ?? 0) + 1;
            shown.value = `${row.total.value}`;
          }}
        >
          {row.label}
        </button>
      ))}
      <button data-testid="count-rows" onClick$={() => (rowCount.value = `${rows.length} rows`)}>
        Count the rows
      </button>
      <output data-testid="result" data-done={shown.value ? '' : undefined}>
        {shown.value}
      </output>
      <output data-testid="row-count" data-done={rowCount.value ? '' : undefined}>
        {rowCount.value}
      </output>
    </>
  );
});
