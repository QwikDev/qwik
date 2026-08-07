import { useSignal } from '@qwik.dev/core';
import { FILTERS } from './filters';

export function App() {
  const items = useSignal([
    { label: 'one', completed: false },
    { label: 'two', completed: true },
  ]);
  const remaining = items.value.filter(FILTERS.active).length;
  return (
    <footer>
      <strong>{remaining}</strong>
    </footer>
  );
}
