import { component$ } from '@builder.io/qwik';

export default component$(() => {
  const counter = { count: 0 };

  return (
    <>
      <div>Count: {counter.count}</div>
      <button onClick$={() => counter.count++}>+1</button>
    </>
  );
});
