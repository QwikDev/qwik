import { component$, type QRL } from '@qwik.dev/core';

export const ActionButton = component$<{ onAction$: QRL<() => void> }>((props) => (
  <button
    data-testid="trigger"
    onClick$={async () => {
      await props.onAction$();
    }}
  >
    Run
  </button>
));
