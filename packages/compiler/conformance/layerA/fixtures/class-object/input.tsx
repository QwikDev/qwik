import { useSignal } from '@qwik.dev/core';

export function App() {
  const active = useSignal(true);
  return <a class={{ selected: active.value, muted: false, wide: true }}>link</a>;
}
