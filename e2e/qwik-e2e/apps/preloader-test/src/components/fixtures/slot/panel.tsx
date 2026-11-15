import { component$, Slot, useComputed$ } from '@qwik.dev/core';

export const Panel = component$<{ title: string }>((props) => {
  const heading = useComputed$(() => props.title.toUpperCase());
  return (
    <div class="panel">
      <h3>{heading.value}</h3>
      <Slot />
    </div>
  );
});
