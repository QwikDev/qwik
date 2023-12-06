import { component$, useStore, $ } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({ name: '' });
  return (
    <>
      <label>
        Enter your name followed by the enter key:{' '}
        <input
          // @ts-expect-error we can't infer through the $. Remove this line when solving
          onInput$={$(async (event) => {
            const input = event.target as HTMLInputElement;
            store.name = input.value;
          })}
          onChange$={$(async () => {
            if (store.name) alert(store.name);
          })}
          value={store.name}
        />
      </label>
    </>
  );
});
