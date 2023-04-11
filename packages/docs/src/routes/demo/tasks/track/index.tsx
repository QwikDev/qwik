import { component$, useSignal, useTask$ } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik/build';

export default component$(() => {
  const text = useSignal('Initial text');
  const delayText = useSignal('');

  useTask$(({ track }) => {
    track(() => text.value);
    const value = text.value;
    const update = () => (delayText.value = value);
    isServer
      ? update() // don't delay on server render value as part of SSR
      : delay(500).then(update); // Delay in browser
  });

  return (
    <section>
      <p>
        Enter text: <input bind:value={text} />
      </p>
      <p>Delayed text: {delayText}</p>
    </section>
  );
});

const delay = (time: number) => new Promise((res) => setTimeout(res, time));
