import { useSignal } from '@qwik.dev/core';

export function App() {
  const count = useSignal(3);
  function Badge({ n }: { n: number }) {
    return <b class="badge">{n}</b>;
  }
  return (
    <div>
      <Badge n={count.value} />
    </div>
  );
}
