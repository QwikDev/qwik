import { component$, useSignal, useTask$ } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik/build';

export default component$(() => {
  const isUppercase = useSignal(false);
  const text = useSignal('');
  const delayText = useSignal('');

  useTask$(({ track }) => {
    const value = track(() =>
      isUppercase.value ? text.value.toUpperCase() : text.value.toLowerCase()
    );
    const update = () => (delayText.value = value);
    isServer
      ? update() // don't delay on server render value as part of SSR
      : delay(500).then(update); // Delay in browser
  });

  return (
    <div>
      Enter text: <input bind:value={text} />
      Is uppercase? <input type="checkbox" bind:checked={isUppercase} />
      <div>Delay text: {delayText}</div>
    </div>
  );
});

function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}
