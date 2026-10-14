import { component$, useSignal } from '@qwik.dev/core';

export function useCounter() {
  const count = useSignal(0);
  return count;
}

export default component$(() => {
  const counter = useCounter();
  return <p id="custom-hooks">Custom hook count: {counter.value}</p>;
});
