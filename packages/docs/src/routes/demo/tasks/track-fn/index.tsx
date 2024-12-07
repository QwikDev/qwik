import { component$, useSignal, useTask$ } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik';

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
    <section>
      <label>
        Enter text: <input bind:value={text} />
      </label>
      <label>
        Is uppercase? <input type="checkbox" bind:checked={isUppercase} />
      </label>
      <p>Delay text: {delayText}</p>
    </section>
  );
});

function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}
