import { component$, useSignal } from '@builder.io/qwik';

export default component$(() => {
  const count = useSignal(0);

  return (
    <main>
      <p>Count: {count.value}</p>
      <p>
        <button onClick$={() => count.value++}>Click</button>
      </p>
    </main>
  );
});
