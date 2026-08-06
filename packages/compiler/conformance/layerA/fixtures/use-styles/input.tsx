import { useSignal, useStyles$ } from '@qwik.dev/core';

export function App() {
  useStyles$(`.card { color: rebeccapurple; }`);
  const label = useSignal('styled');
  return <p class="card">{label.value}</p>;
}
