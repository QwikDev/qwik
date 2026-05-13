import { Show, component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const count = useSignal(0);

  return (
    <>
      <button onClick$={() => count.value++}>Add item</button>
      <button onClick$={() => (count.value = 0)}>Clear</button>

      <Show
        when$={() => count.value}
        then$={(count) => (
          <p>
            {count} item{count === 1 ? '' : 's'} in your cart.
          </p>
        )}
        else$={(count) => <p>Your cart is empty ({count}).</p>}
      />
    </>
  );
});
