import { component$, Slot, useStore } from '@builder.io/qwik';

export default component$(() => {
  console.log('Render: <App>');
  return (
    <Collapsable>
      <div q:slot="closed">▶ (collapsed summary)</div>
      <div q:slot="open">
        ▼<div> Content that should be displayed when the collapse component is open. </div>
      </div>
    </Collapsable>
  );
});

export const Collapsable = component$(() => {
  console.log('Render: <Collapsable>');
  const store = useStore({ open: true });
  return (
    <div onClick$={() => (store.open = !store.open)}>
      {store.open ? <Slot name="open" /> : <Slot name="closed" />}
    </div>
  );
});
