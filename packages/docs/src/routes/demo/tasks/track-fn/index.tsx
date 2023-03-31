import { component$, useSignal, useTask$ } from '@builder.io/qwik';

export default component$(() => {
  const isUppercase = useSignal(false);
  const text = useSignal('');
  const delayText = useSignal('');

  useTask$(({ track }) => {
    const value = track(() =>
      isUppercase.value ? text.value.toUpperCase() : text.value.toLowerCase()
    );
    delay(500).then(() => (delayText.value = value));
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
