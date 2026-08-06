import { Slot, useSignal, type QRL } from '@qwik.dev/core';

function Button(props: { id: string; onClick$: QRL<() => void> }) {
  return (
    <button id={props.id} type="button" stoppropagation:click onClick$={props.onClick$}>
      <Slot />
    </button>
  );
}

export function App() {
  const count = useSignal(0);
  return (
    <main>
      <Button id="inc" onClick$={() => (count.value += 2)}>
        Add
      </Button>
      <span id="value">{count.value}</span>
    </main>
  );
}
