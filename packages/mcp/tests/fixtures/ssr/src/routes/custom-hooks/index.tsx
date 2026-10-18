import { $, component$, useSignal } from '@qwik.dev/core';

export function useCounter() {
  const count = useSignal(0);
  return count;
}

export function useLabel() {
  return (name: string) => `Custom hook ${name}`;
}

export function useClickHandler() {
  return $(() => {});
}

export default component$(() => {
  const counter = useCounter();
  const label = useLabel();
  const onClick = useClickHandler();
  return (
    <p id="custom-hooks" onClick$={onClick}>
      {label('count')}: {counter.value}
    </p>
  );
});
