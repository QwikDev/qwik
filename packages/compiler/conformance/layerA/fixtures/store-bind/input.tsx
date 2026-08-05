import { useSignal, useStore } from '@qwik.dev/core';

export function App() {
  const text = useSignal('hi');
  const form = useStore({ sent: 0 });
  return (
    <form>
      <input bind:value={text} />
      <output>{form.sent}</output>
    </form>
  );
}
