import { component$, useSignal } from '@qwik.dev/core';

export const DocsSidebar = component$(() => {
  const clicks = useSignal(0);
  return (
    <button data-testid="docs-sidebar" onClick$={() => clicks.value++}>
      docs layout, clicked {clicks.value}
    </button>
  );
});
