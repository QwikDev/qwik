import { component$, useSignal } from '@builder.io/qwik';
import circleSvg from './assets/circle.svg?url';

// We need to extract the component to see the bug on 1.5.7
export default component$(() => {
  const isOpenSig = useSignal(false);
  return (
    <>
      <img src={circleSvg} />
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
