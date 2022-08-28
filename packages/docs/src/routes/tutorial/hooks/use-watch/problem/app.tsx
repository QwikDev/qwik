import { component$, useWatch$, useStore } from '@builder.io/qwik';

export const App = component$(() => {
  const store = useStore({
    value: '',
    debouncedValue: '',
  });
  useWatch$(({ track }) => {
    // Use track to rerun this function when store's `value` property changes.

    // Setup a timer to copy `value => debouncedValue` after half a second.
    
    // Return cleanup function in case `value` property changes before time is up.
    return () => {
      // cleanup code
    };
  });
  return (
    <>
      <input
        value={store.value}
        onKeyUp$={(event) => (store.value = (event.target as HTMLInputElement).value)}
      />
      <br />
      Current value: {store.value}
      <br />
      Debaunced value: {store.debouncedValue}
    </>
  );
});
