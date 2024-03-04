// @ts-ignore: Unused import
import { component$, useStore, $ } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({ name: '' });
  return (
    <>
      <label>
        Enter your name followed by the enter key:{' '}
        <input
          onInput$={(event, input) => {
            store.name = input.value;
          }}
          onChange$={() => {
            if (store.name) alert(store.name);
          }}
          value={store.name}
        />
      </label>
    </>
  );
});
