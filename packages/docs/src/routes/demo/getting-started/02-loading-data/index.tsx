import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useDadJoke = routeLoader$(async () => {
  const response = await fetch('https://icanhazdadjoke.com/', {
    headers: { Accept: 'application/json' },
  });
  return (await response.json()) as {
    id: string;
    status: number;
    joke: string;
  };
});

export default component$(() => {
  // Calling our `useDadJoke` hook, will return a reactive signal to the loaded data.
  const dadJokeSignal = useDadJoke();
  return (
    <section class="section bright">
      <p>{dadJokeSignal.value.joke}</p>
    </section>
  );
});
