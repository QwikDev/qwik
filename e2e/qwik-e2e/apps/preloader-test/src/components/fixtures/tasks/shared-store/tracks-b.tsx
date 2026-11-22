import { component$, useContext, useSignal, useTask$ } from '@qwik.dev/core';
import { SharedStoreContext } from './store';

export const TracksB = component$(() => {
  const store = useContext(SharedStoreContext);
  const out = useSignal(0);
  useTask$(({ track }) => {
    const n = track(() => store.b);
    out.value = n && n + 1;
  });
  return <span class="step">b: {out.value}</span>;
});
