import { component$, useSignal, useTask$ } from "@qwik.dev/core";

export default component$(() => {
  const count = useSignal(0);
  useTask$(({ track }) => {
    track(() => count.value);
    console.log("count", count.value);
  });
  return (
    <>
      <p>Test1</p>
      <button onClick$={() => count.value++}>Increment</button>
      <p>Current Count: {count.value}</p>
    </>
  );
});
