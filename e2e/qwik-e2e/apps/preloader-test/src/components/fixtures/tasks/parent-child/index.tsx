import { component$, useSignal, useTask$ } from '@qwik.dev/core';
import { Child } from './child';

export default component$(() => {
  const input = useSignal(0);
  const out = useSignal(0);
  useTask$(({ track }) => {
    const n = track(input);
    out.value = n && n + 1;
  });
  return (
    <section class="fixture" data-fixture="tasks/parent-child">
      <h2>tasks in a parent and its child</h2>
      <button data-testid="trigger" onClick$={() => (input.value = 1)}>
        Run
      </button>
      <span class="step">parent: {out.value}</span>
      <Child input={input} />
    </section>
  );
});
