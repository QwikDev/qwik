import { component$, useTask$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({
    value: '',
    debouncedValue: '',
  });
  useTask$(({ track, cleanup }) => {
    // rerun this function  when `value` property changes.
    track(() => store.value);
    // Set up timeout for debounced value.
    const id = setTimeout(() => (store.debouncedValue = store.value), 500);
    // return cleanup function in case `value` property changes before time is up.
    cleanup(() => clearTimeout(id));
  });
  return (
    <>
      <input value={store.value} onInput$={(ev, el) => (store.value = el.value)} />
      <br />
      Current value: {store.value}
      <br />
      Debounced value: {store.debouncedValue}
    </>
  );
});
