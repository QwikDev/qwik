import { component$, useComputed$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const base = useSignal(3);
  const square = useComputed$(() => base.value * base.value);
  return (
    <p>
      base {base.value} squared {square.value}
    </p>
  );
});
