import { Slot, component$, useSignal } from '@builder.io/qwik';

const Accordion = component$(() => {
  const isOpen = useSignal(false);
  return (
    <div>
      <h1 onClick$={() => (isOpen.value = !isOpen.value)}>
        {isOpen.value ? '▼' : '▶︎'}
      </h1>
      {isOpen.value && <Slot />}
    </div>
  );
});

export default component$(() => {
  return (
    <Accordion>
      I am pre-rendered on the Server and hidden until needed.
    </Accordion>
  );
});
