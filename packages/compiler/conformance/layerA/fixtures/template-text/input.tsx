import { useSignal } from '@qwik.dev/core';

export function App() {
  const name = useSignal('world');
  return <p>{`Hello ${name.value}!`}</p>;
}
