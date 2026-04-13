import { component$, useSignal, useTask$ } from '@qwik.dev/core';

export default component$(() => {
  const input = useSignal(1);
  const doubled = useSignal(0);

  useTask$(({ track }) => {
    const value = track(() => input.value);
    doubled.value = value * 2;
  });

  return (
    <p>
      input {input.value} doubled {doubled.value}
    </p>
  );
});
