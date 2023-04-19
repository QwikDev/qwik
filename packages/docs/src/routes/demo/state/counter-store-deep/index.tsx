import { component$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore(
    {
      nested: { fields: { are: 'not tracked' } },
    },
    { deep: true }
  );

  return (
    <>
      <p>{store.nested.fields.are}</p>
      <button onClick$={() => (store.nested.fields.are = 'tracked')}>
        Clicking me works because store is deep watched
      </button>
      <br />
      <button onClick$={() => (store.nested = { fields: { are: 'tracked' } })}>
        Click me still works
      </button>
    </>
  );
});
