import { useSignal } from '@qwik.dev/core';

// E7: `!`, unary `-` and `typeof` must follow JS, on a signal read
export function App() {
  const count = useSignal(3);
  const flag = useSignal(false);
  return (
    <main>
      <span id="not" class={!flag.value ? 'yes' : 'no'}>
        {-count.value}
      </span>
      <span id="typeof">{typeof count.value}</span>
    </main>
  );
}
