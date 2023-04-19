import { Slot, component$, useSignal } from '@builder.io/qwik';

export const Collapsible = component$(() => {
  const isOpen = useSignal(true);

  return (
    <div>
      <h1 onClick$={() => (isOpen.value = !isOpen.value)}>
        {isOpen.value ? '▼' : '▶︎'}
        <Slot name="title" />
      </h1>
      {isOpen.value && <Slot />}
    </div>
  );
});

export default component$(() => {
  const title = useSignal('Qwik');
  const description = useSignal(
    'A resumable framework for building instant web applications'
  );
  return (
    <>
      <label>Title</label>
      <input bind:value={title} type="text" />
      <label>Description</label>
      <textarea bind:value={description} cols={50} />
      <hr />
      <Collapsible>
        <span q:slot="title">{title}</span>
        {description}
      </Collapsible>
    </>
  );
});
