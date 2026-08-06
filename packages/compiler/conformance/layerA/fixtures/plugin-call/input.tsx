import { useSignal } from '@qwik.dev/core';
import { makeGreeting } from './greeting';

export function App() {
  const greeting = useSignal(makeGreeting('qwik'));
  return (
    <main>
      <b id="text">{greeting.value}</b>
      <button id="shout" onClick$={() => (greeting.value = greeting.value.toUpperCase())}>
        shout
      </button>
    </main>
  );
}
