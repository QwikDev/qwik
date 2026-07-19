import { useSignal } from '@qwik.dev/core';

export function Root() {
  const count = useSignal(0);

  return (
    <button id="count" onClick$={() => count.value++}>
      {count.value}
    </button>
  );
}
