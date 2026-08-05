import { useSignal } from '@qwik.dev/core';

export function App() {
  const count = useSignal(3);
  return <button onClick$={() => count.value++}>{count.value}</button>;
}
