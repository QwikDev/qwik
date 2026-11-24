import { component$, useComputed$, useSignal } from '@qwik.dev/core';
import { Panel } from './panel';

export const Stats = component$(() => {
  const items = useSignal([1, 2, 3]);
  const total = useComputed$(() => items.value.reduce((sum, n) => sum + n, 0), {
    serializationStrategy: 'never',
  });
  return <Panel total={total} />;
});
