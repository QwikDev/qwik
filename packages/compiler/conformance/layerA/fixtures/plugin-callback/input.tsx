import { useSignal } from '@qwik.dev/core';
import { compute } from './compute';

export function App() {
  const count = useSignal(4);
  const label = compute(() => {
    const doubled = count.value * 2;
    return `x${doubled}`;
  });
  return <p>{label}</p>;
}
