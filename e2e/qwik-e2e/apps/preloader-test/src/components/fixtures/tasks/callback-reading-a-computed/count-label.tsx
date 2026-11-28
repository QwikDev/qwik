import { component$, useContext, useSignal, useTask$, type Signal } from '@qwik.dev/core';
import { TotalContext } from './context';

export const CountLabel = component$<{ count: Signal<number> }>(({ count }) => {
  const { total } = useContext(TotalContext);
  const label = useSignal('');
  useTask$(({ track }) => {
    const n = track(count);
    if (n) {
      label.value = `${n} of ${total.value}`;
    }
  });
  return <p data-testid="label">{label.value}</p>;
});
