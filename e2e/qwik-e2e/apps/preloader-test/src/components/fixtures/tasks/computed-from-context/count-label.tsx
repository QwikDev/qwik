import { component$, useContext, useSignal, useTask$ } from '@qwik.dev/core';
import { CounterContext } from './context';

type TaskRuns = { taskRuns?: number };

export const CountLabel = component$(() => {
  const { count, total } = useContext(CounterContext);
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
});
