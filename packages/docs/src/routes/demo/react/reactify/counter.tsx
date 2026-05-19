import { component$, useSignal } from '@qwik.dev/core';

export const QwikCounter = component$<{ label?: string }>((props) => {
  const count = useSignal(0);
  return (
    <button onClick$={() => count.value++}>
      {props.label}: {count.value}
    </button>
  );
});
