import { component$, useSignal, useTask$ } from '@builder.io/qwik';
import { isServer } from '@builder.io/qwik';

export default component$(() => {
  const text = useSignal('Initial text');
  const isBold = useSignal(false);

  useTask$(({ track }) => {
    track(() => text.value);
    if (isServer) {
      return; // Server guard
    }
    isBold.value = true;
    delay(1000).then(() => (isBold.value = false));
  });

  return (
    <section>
      <label>
        Enter text: <input bind:value={text} />
      </label>
      <p style={{ fontWeight: isBold.value ? 'bold' : 'normal' }}>
        Text: {text}
      </p>
    </section>
  );
});

const delay = (time: number) => new Promise((res) => setTimeout(res, time));
