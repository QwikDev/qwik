import { Slot, useSignal } from '@qwik.dev/core';

export function App() {
  const title = useSignal('Hello');
  function Card({ kind }: { kind: string }) {
    return (
      <div class={kind}>
        <Slot />
      </div>
    );
  }
  return (
    <Card kind="box">
      <p>{title.value}</p>
    </Card>
  );
}
