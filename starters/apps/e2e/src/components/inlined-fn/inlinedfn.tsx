import { component$, useSignal, $$ } from '@builder.io/qwik';

export const InlinedFn = component$(() => {
  const foo = useSignal(0);
  const bar = useSignal(0);
  const final = useSignal(0);
  const sum = $$(() => foo.value + bar.value);
  return (
    <>
      <button
        id="count"
        onClick$={() => {
          foo.value++;
          bar.value++;

          final.value = sum();
        }}
      >
        Increment {final.value}
      </button>
    </>
  );
});
