import { component$, useComputed$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const name = useSignal('Qwik');
  const capitalizedName = useComputed$(() => {
    // it will automatically reexecute when name.value changes
    return name.value.toUpperCase();
  });

  return (
    <>
      <input type="text" bind:value={name} />
      <p>Name: {name.value}</p>
      <p>Capitalized name: {capitalizedName.value}</p>
    </>
  );
});
