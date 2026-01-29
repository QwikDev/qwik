/* eslint-disable no-console */
import { component$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({ count: 0 });
  return (
    <>
      Count: {store.count} <button onClick$={() => console.log('+1')}>+1</button>
    </>
  );
});
