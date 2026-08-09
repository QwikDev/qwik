import { useSignal } from '@qwik.dev/core';

// E6: reading by index — a reactive index, and a literal one
export function App() {
  const words = useSignal(['zero', 'one', 'two']);
  const at = useSignal(1);
  return (
    <main>
      <span id="picked">{words.value[at.value]}</span>
      <span id="first">{words.value[0]}</span>
    </main>
  );
}
