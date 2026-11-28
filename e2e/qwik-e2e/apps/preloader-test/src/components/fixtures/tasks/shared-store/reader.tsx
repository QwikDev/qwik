import { component$, useContext, useSignal } from '@qwik.dev/core';
import { SharedStoreContext } from './store';

export const Reader = component$(() => {
  const store = useContext(SharedStoreContext);
  const seen = useSignal(0);
  return (
    <>
      <button data-testid="read" onClick$={() => (seen.value = store.b + 1)}>
        Read b
      </button>
      <output data-testid="read-result" data-done={seen.value ? '' : undefined}>
        {seen.value}
      </output>
    </>
  );
});
