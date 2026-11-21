import { component$, useSignal } from '@qwik.dev/core';

export const Translated = component$(() => {
  const count = useSignal(5);
  const show = useSignal(true);
  return (
    <div id="translated">
      <button id="count" onClick$={() => count.value++}>
        Count
      </button>
      <button id="toggle" onClick$={() => (show.value = !show.value)}>
        Toggle
      </button>
      <p id="only">{count.value}</p>
      <p id="conditional">
        {show.value ? 'A conditional sentence.' : ''}
        <b>Bold neighbor.</b>
      </p>
      <RenderedSentence count={count.value} />
    </div>
  );
});

/** Reads its prop while rendering, so it renders again and recovers the text around the number. */
export const RenderedSentence = component$((props: { count: number }) => {
  const count = props.count;
  return <p id="sentence">You have clicked the button {count} times so far.</p>;
});
