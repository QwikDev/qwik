import { component$, useSignal } from '@qwik.dev/core';

export const ShellBanner = component$(() => {
  const clicks = useSignal(0);
  return (
    <button data-testid="shell-banner" onClick$={() => clicks.value++}>
      shell layout, clicked {clicks.value}
    </button>
  );
});
