import { component$, useSignal, useTask$, type ReadonlySignal, type Signal } from '@qwik.dev/core';

type TaskRuns = { taskRuns?: number };

export const CountLabel = component$<{ count: Signal<number>; total: ReadonlySignal<number> }>(
  ({ count, total }) => {
    const label = useSignal('');
    useTask$(({ track }) => {
      const n = track(count);
      if (!n) {
        return;
      }
      const runs = globalThis as TaskRuns;
      runs.taskRuns = (runs.taskRuns ?? 0) + 1;
      label.value = `${n} of ${total.value}`;
    });
    return (
      <output data-testid="result" data-done={label.value ? '' : undefined}>
        {label.value}
      </output>
    );
  }
);
