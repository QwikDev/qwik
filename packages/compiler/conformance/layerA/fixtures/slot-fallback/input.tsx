import { Slot, useSignal } from '@qwik.dev/core';

export function Card({ kind }: { kind: string }) {
  return (
    <div class={kind}>
      <Slot>no content</Slot>
    </div>
  );
}

export function App() {
  const title = useSignal('Hi');
  return (
    <main>
      <Card kind="a">
        <p>{title.value}</p>
      </Card>
      <Card kind="b" />
    </main>
  );
}
