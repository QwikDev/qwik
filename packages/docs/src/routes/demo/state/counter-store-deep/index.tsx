import { component$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({
    nested: {
      fields: { are: 'also tracked' },
    },
    list: [] as string[],
  });

  return (
    <>
      <p>{store.nested.fields.are}</p>
      <button
        onClick$={() => {
          // Even though we are mutating a nested object, this will trigger a re-render
          store.nested.fields.are = 'tracked';
        }}
      >
        Clicking me works because store is deep watched
      </button>
      <br />
      <button
        onClick$={() => {
          // Because store is deep watched, this will trigger a re-render
          store.list.push(`Item ${store.list.length}`);
        }}
      >
        Add to list
      </button>
      <ul>
        {store.list.map((item) => (
          <li>{item}</li>
        ))}
      </ul>
    </>
  );
});
