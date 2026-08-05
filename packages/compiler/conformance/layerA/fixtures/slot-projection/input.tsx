import { Slot, useSignal } from '@qwik.dev/core';

export function Card(props: { title: string }) {
  return (
    <article class="card">
      <h2>{props.title}</h2>
      <Slot />
    </article>
  );
}

export function App() {
  const count = useSignal(3);
  return (
    <Card title="totals">
      <p>Count is {count.value}</p>
    </Card>
  );
}
