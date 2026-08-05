import { useSignal } from '@qwik.dev/core';

export function Badge(props: { label: string; count: number }) {
  return (
    <span class="badge">
      {props.label}: {props.count}
    </span>
  );
}

export function App() {
  const count = useSignal(3);
  return (
    <div>
      <Badge label="clicks" count={count.value} />
    </div>
  );
}
