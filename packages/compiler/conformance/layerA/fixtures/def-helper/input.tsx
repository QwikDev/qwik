import { useSignal } from '@qwik.dev/core';

function double(n: number) {
  return n * 2;
}

const label = (n: number) => `value ${double(n)}`;

export function App() {
  const count = useSignal(3);
  return <p>{label(count.value)}</p>;
}
