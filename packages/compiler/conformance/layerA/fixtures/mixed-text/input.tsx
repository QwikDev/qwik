import { useSignal } from '@qwik.dev/core';

export function App() {
  const count = useSignal(3);
  return (
    <p>
      Count: {count.value}! (limit {count.value + 7})
    </p>
  );
}
