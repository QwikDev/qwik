import { component$, type Signal } from '@qwik.dev/core';

export const Writer = component$<{ count: Signal<number> }>(({ count }) => (
  <button data-testid="trigger" onClick$={() => count.value++}>
    Count
  </button>
));
