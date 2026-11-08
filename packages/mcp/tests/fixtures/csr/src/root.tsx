import { component$, useSignal } from '@qwik.dev/core';

export function useLabel() {
  return (name: string) => `${name} counter`;
}

export default component$(() => {
  const count = useSignal(0);
  const label = useLabel();
  return (
    <button id="counter" title={label('MCP')} onClick$={() => count.value++}>
      Count: {count.value}
    </button>
  );
});
