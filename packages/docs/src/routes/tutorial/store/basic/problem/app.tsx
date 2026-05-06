import { component$ } from '@qwik.dev/core';

export default component$(() => {
  const counter = { count: 0 };

  return (
    <>
      <p>Count: {counter.count}</p>
      <button onClick$={() => counter.count++}>+1</button>
    </>
  );
});
