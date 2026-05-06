import { component$, useComputed$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const name = useSignal('Qwik');
  const upperName = useComputed$(() => {
    // Runs again when name.value changes.
    return name.value.toUpperCase();
  });

  return (
    <>
      <input type="text" bind:value={name} />
      <p>Name: {name.value}</p>
      <p>Uppercase name: {upperName.value}</p>
    </>
  );
});
