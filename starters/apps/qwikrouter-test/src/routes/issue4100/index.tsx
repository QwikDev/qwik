import { component$, useSignal } from "@qwik.dev/core";

export default component$(() => {
  const count = useSignal(0);
  return (
    <div>
      <button onClick$={() => count.value++}>Click me {count.value}</button>
      <a href="#navigate">Navigate</a>
    </div>
  );
});
