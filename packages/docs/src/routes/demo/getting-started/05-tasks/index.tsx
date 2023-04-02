/* eslint-disable no-console */
import { component$, useSignal, useTask$ } from '@builder.io/qwik';
import { routeLoader$, Form, routeAction$, server$ } from '@builder.io/qwik-city';

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

export const useJokeVoteAction = routeAction$((props) => {
  console.log('VOTE', props);
});

export default component$(() => {
  const isFavoriteSignal = useSignal(false);
  const dadJokeSignal = useDadJoke();
  const favoriteJokeAction = useJokeVoteAction();
  useTask$(({ track }) => {
    track(isFavoriteSignal);
    console.log('FAVORITE (isomorphic)', isFavoriteSignal.value);
    server$(() => {
      console.log('FAVORITE (server)', isFavoriteSignal.value);
    })();
  });
  return (
    <div class="section bright">
      <div>{dadJokeSignal.value.joke}</div>
      <Form action={favoriteJokeAction}>
        <input type="hidden" name="jokeID" value={dadJokeSignal.value.id} />
        <button name="vote" value="up">
          👍
        </button>
        <button name="vote" value="down">
          👎
        </button>
      </Form>
      <button onClick$={() => (isFavoriteSignal.value = !isFavoriteSignal.value)}>
        {isFavoriteSignal.value ? '❤️' : '🤍'}
      </button>
    </div>
  );
});
