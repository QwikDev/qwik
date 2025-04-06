import { component$, useSignal } from '@builder.io/qwik';

// We need to extract the component to see the bug on 1.5.7
export default component$(() => {
  const isOpenSig = useSignal(false);
  return (
    <>
      <button
        onClick$={() => {
          return (isOpenSig.value = !isOpenSig.value);
        }}
      >
        click me
      </button>
      {isOpenSig.value && <div data-testid="hi">Hi 👋</div>}
    </>
  );
});
