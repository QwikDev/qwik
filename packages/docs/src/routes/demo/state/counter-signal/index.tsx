import { component$, useSignal } from '@qwikdev/core';

export default component$(() => {
  const count = useSignal(0);

  return (
    <button onClick$={() => count.value++}>
      Increment {count.value}
    </button>
  );
});
