import { useSignal } from '@qwik.dev/core';

// setup may branch; only hooks, returns, JSX and $ boundaries must stay linear
export function App() {
  const count = useSignal(3);
  let label = 'few';
  if (count.value > 2) {
    label = 'many';
  } else {
    label = 'few';
  }
  return (
    <main>
      <span id="label">{label}</span>
      <span id="count">{count.value}</span>
    </main>
  );
}
