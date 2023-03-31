import { component$, useSignal, useTask$ } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik/build';

export default component$(() => {
  const text = useSignal('Initial text');
  const isBold = useSignal(false);

  useTask$(({ track }) => {
    track(text);
    if (isServer) {
      return; // Server guard
    }
    isBold.value = true;
    delay(1000).then(() => (isBold.value = false));
  });

  return (
    <div>
      Enter text: <input bind:value={text} />
      <div style={{ fontWeight: isBold.value ? 'bold' : 'normal' }}>Text: {text}</div>
    </div>
  );
});

const delay = (time: number) => new Promise((resolve) => setTimeout(resolve, time));
