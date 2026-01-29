/* eslint-disable no-console */
import { component$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({ count: 0 });
  return (
    <>
      Count: {store.count} <button onClick$={() => store.count++}>+1</button>
    </>
  );
});
