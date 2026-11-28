import { component$, useContext } from '@qwik.dev/core';
import { CounterContext } from './context';

export const Writer = component$(() => {
  const { count } = useContext(CounterContext);
  return (
    <button data-testid="trigger" onClick$={() => count.value++}>
      Count
    </button>
  );
});
