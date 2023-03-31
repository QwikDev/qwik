import { component$, useSignal, useTask$ } from '@builder.io/qwik';

export default component$(() => {
  const text = useSignal('Initial text');
  const delayText = useSignal('');

  useTask$(({ track }) => {
    track(text);
    const value = text.value;
    delay(500).then(() => (delayText.value = value));
  });

  return (
    <div>
      Enter text: <input bind:value={text} />
      <div>Delay text: {delayText}</div>
    </div>
  );
});

const delay = (time: number) => new Promise((resolve) => setTimeout(resolve, time));
