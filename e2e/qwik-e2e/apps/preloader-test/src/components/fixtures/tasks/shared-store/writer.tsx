import { component$, useContext } from '@qwik.dev/core';
import { SharedStoreContext } from './store';

export const Writer = component$(() => {
  const store = useContext(SharedStoreContext);
  return (
    <button data-testid="trigger" onClick$={() => (store.a = 1)}>
      Change a
    </button>
  );
});
