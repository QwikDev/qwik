import { component$, useSignal, useTask$ } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik/build';

export default component$(() => {
  const text = useSignal('Initial text');
  const delayText = useSignal('');

  useTask$(({ track }) => {
    track(text);
    const value = text.value;
    const update = () => (delayText.value = value);
    isServer
      ? update() // don't delay on server render value as part of SSR
      : delay(500).then(update); // Delay in browser
  });

  return (
    <div>
      Enter text: <input bind:value={text} />
      <div>Delayed text: {delayText}</div>
    </div>
  );
});

const delay = (time: number) => new Promise((resolve) => setTimeout(resolve, time));
