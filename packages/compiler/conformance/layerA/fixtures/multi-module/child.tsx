import { useSignal } from '@qwik.dev/core';

export function Counter(props: { label: string }) {
  const count = useSignal(1);
  return (
    <button onClick$={() => count.value++}>
      {props.label}: {count.value}
    </button>
  );
}
