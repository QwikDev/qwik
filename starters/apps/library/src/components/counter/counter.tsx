import { component$, PropsOf, useSignal } from "@qwik.dev/core";

export const Counter = component$<PropsOf<"div">>(() => {
  const count = useSignal(0);

  return (
    <div>
      <p>Count: {count.value}</p>
      <p>
        <button onClick$={() => count.value++}>Increment</button>
      </p>
    </div>
  );
});
