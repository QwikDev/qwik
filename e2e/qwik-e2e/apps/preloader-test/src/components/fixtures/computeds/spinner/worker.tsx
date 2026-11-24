import { component$, useSignal, useTask$, type Signal } from '@qwik.dev/core';

export const Worker = component$<{ request: Signal<number>; loading: Signal<boolean> }>(
  ({ request, loading }) => {
    const result = useSignal('');
    useTask$(({ track }) => {
      const n = track(request);
      if (!n) {
        return;
      }
      result.value = `work ${n}`;
      loading.value = false;
    });
    return (
      <output data-testid="result" data-done={result.value ? '' : undefined}>
        {result.value}
      </output>
    );
  }
);
