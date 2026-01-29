import { component$ } from '@builder.io/qwik';
import { routeLoader$, Form, routeAction$ } from '@builder.io/qwik-city';

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
  // Calling our `useDadJoke` hook, will return a reactive signal to the loaded data.
  const dadJokeSignal = useDadJoke();
  const favoriteJokeAction = useJokeVoteAction();
  return (
    <section class="section bright">
      <p>{dadJokeSignal.value.joke}</p>
      <Form action={favoriteJokeAction}>
        <input type="hidden" name="jokeID" value={dadJokeSignal.value.id} />
        <button name="vote" value="up">
          👍
        </button>
        <button name="vote" value="down">
          👎
        </button>
      </Form>
    </section>
  );
});
