import { component$, useSignal, useTask$, type ReadonlySignal, type Signal } from '@qwik.dev/core';

type TaskRuns = { taskRuns?: number };
type State = { stats: { total: ReadonlySignal<number> } };

export const CountLabel = component$<{ count: Signal<number>; state: State }>(
  ({ count, state }) => {
    const label = useSignal('');
    useTask$(({ track }) => {
      const n = track(count);
      if (!n) {
        return;
      }
      const runs = globalThis as TaskRuns;
      runs.taskRuns = (runs.taskRuns ?? 0) + 1;
      label.value = `${n} of ${state.stats.total.value}`;
    });
    return (
      <output data-testid="result" data-done={label.value ? '' : undefined}>
        {label.value}
      </output>
    );
  }
);
