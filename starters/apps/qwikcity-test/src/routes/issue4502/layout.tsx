import { Slot, component$, useSignal } from '@builder.io/qwik';

export default component$(() => {
  const count = useSignal(0);
  console.log('RENDER');
  return (
    <div>
      <button id="count" onClick$={() => count.value++}>
        Count: {count.value}
      </button>
      <Slot />
    </div>
  );
});
