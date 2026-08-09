import { useSignal } from '@qwik.dev/core';

// global functions have no owner object — `String(x)`, not `Global.String(x)`
export function App() {
  const count = useSignal(7);
  const label = String(count.value);
  const parsed = parseInt(label, 10);
  return (
    <main>
      <span id="label">{label}</span>
      <span id="parsed">{parsed}</span>
    </main>
  );
}
