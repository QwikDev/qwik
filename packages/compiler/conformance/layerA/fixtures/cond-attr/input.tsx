import { useSignal } from '@qwik.dev/core';

export function App() {
  const selected = useSignal(false);
  const label = useSignal('on');
  return (
    <main>
      <button
        id="row"
        class={selected.value ? 'danger' : ''}
        onClick$={() => (selected.value = !selected.value)}
      >
        {selected.value ? label.value : 'off'}
      </button>
    </main>
  );
}
