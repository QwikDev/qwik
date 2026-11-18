import { component$, useContext, useSignal, useTask$ } from '@qwik.dev/core';
import { SharedStoreContext } from './store';

export const TracksA = component$(() => {
  const store = useContext(SharedStoreContext);
  const out = useSignal(0);
  useTask$(({ track }) => {
    const n = track(() => store.a);
    out.value = n && n + 1;
  });
  return (
    <output data-testid="result" data-done={out.value ? '' : undefined}>
      {out.value}
    </output>
  );
});
