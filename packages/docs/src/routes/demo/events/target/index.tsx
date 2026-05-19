import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const currentElm = useSignal<HTMLElement|null>(null);
  const targetElm = useSignal<HTMLElement|null>(null);

  return (
    <section onClick$={(event, currentTarget) => {
      currentElm.value = currentTarget;
      targetElm.value = event.target as HTMLElement;
    }}>
      Click on any text <code>target</code> and <code>currentElm</code> of the event.
      <hr/>
      <p>Hello <b>World</b>!</p>
      <hr/>
      <ul>
        <li>currentElm: {currentElm.value?.tagName}</li>
        <li>target: {targetElm.value?.tagName}</li>
      </ul>
    </section>
  );
});