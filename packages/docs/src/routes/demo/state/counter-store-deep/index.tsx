import { component$, useStore } from '@qwik.dev/core';

export default component$(() => {
  const store = useStore({
    nested: {
      fields: { are: 'also tracked' },
    },
    list: ['Item 1'],
  });

  return (
    <>
      <p>{store.nested.fields.are}</p>
      <button
        onClick$={() => {
          // Updating a nested property updates the UI.
          store.nested.fields.are = 'tracked';
        }}
      >
        Update nested field
      </button>
      <br />
      <button
        onClick$={() => {
          // Updating an array also updates the UI.
          store.list.push(`Item ${store.list.length + 1}`);
        }}
      >
        Add to list
      </button>
      <ul>
        {store.list.map((item, key) => (
          <li key={key}>{item}</li>
        ))}
      </ul>
    </>
  );
});
