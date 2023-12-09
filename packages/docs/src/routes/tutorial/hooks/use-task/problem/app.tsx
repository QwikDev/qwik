import { component$, useTask$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({
    value: '',
    debouncedValue: '',
  });
  useTask$(({ track, cleanup }) => {
    // Use track to rerun this function when store's `value` property changes.

    // Setup a timer to copy `value => debouncedValue` after half a second.

    // Return cleanup function in case `value` property changes before time is up.
    cleanup(() => {
      // cleanup code
    });
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
