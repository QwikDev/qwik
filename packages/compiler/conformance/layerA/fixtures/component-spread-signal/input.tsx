import { useSignal } from '@qwik.dev/core';

export function Badge({ kind, label, n }: { kind: string; label: string; n: number }) {
  return (
    <b class={kind}>
      {label}
      {n}
    </b>
  );
}

export function App() {
  const count = useSignal(3);
  const shared = { kind: 'box', label: 'hi' };
  return (
    <div>
      <Badge {...shared} n={count.value} />
    </div>
  );
}
