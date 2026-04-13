import { $, component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const open = useSignal(false);
  return (
    <div>
      <button type="button" onClick$={$(() => (open.value = !open.value))}>
        toggle
      </button>
      {open.value ? <p>revealed</p> : null}
    </div>
  );
});
