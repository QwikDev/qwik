import { component$, useSignal, useTask$ } from '@builder.io/qwik';

export default component$(() => {
  const text = useSignal('');
  const debounceText = useSignal('');

  useTask$(({ track, cleanup }) => {
    const value = track(() => text.value);
    const id = setTimeout(() => (debounceText.value = value), 500);
    cleanup(() => clearTimeout(id));
  });

  return (
    <section>
      <p>
        Enter text: <input bind:value={text} />
      </p>
      <p>Debounced text: {debounceText}</p>
    </section>
  );
});
