import { component$, useSignal } from '@qwik.dev/core';

export const Translated = component$(() => {
  const count = useSignal(5);
  const show = useSignal(true);
  const words = useSignal(['alpha', 'beta']);
  return (
    <div id="translated">
      <button id="count" onClick$={() => count.value++}>
        Count
      </button>
      <button id="toggle" onClick$={() => (show.value = !show.value)}>
        Toggle
      </button>
      <button id="reverse" onClick$={() => (words.value = [...words.value].reverse())}>
        Reverse
      </button>
      <p id="only">{count.value}</p>
      <p id="words">
        {words.value.map((word) => (
          <Word key={word} label={`${word} ${count.value}`} />
        ))}
      </p>
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

/** Has no element around its text, so reordering it moves the text node itself. */
export const Word = component$((props: { label: string }) => {
  return (
    <>
      {props.label}
      <br />
    </>
  );
});
