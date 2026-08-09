import { useSignal } from '@qwik.dev/core';

const WORDS = ['zero', 'one', 'two'];

// E6: reading by computed index, with the index itself reactive
export function App() {
  const at = useSignal(1);
  return (
    <main>
      <span id="picked">{WORDS[at.value]}</span>
      <span id="last">{WORDS[WORDS.length - 1]}</span>
    </main>
  );
}
