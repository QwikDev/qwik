import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const name = useSignal('World');
  console.log('<App> renders');

  return (
    <main>
      <h1>Hello {name.value}!</h1>
      <label>
        Your name: <input bind:value={name} />
      </label>
      <p>
        Typing updates the heading directly from the signal. <code>&lt;App&gt;</code> never
        re-renders (see the Console), so the browser only loads Qwik core, not this component.
      </p>
    </main>
  );
});
