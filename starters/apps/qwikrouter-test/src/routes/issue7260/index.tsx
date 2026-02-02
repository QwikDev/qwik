import { component$, useSignal, useTask$ } from "@qwik.dev/core";
import { routeLoader$, Form, routeAction$, server$ } from "@qwik.dev/router";

export const useDadJoke = routeLoader$(async () => {
  return Math.random() > 0.5
    ? {
        id: "1",
        status: 200,
        joke: "Joke A",
      }
    : {
        id: "2",
        status: 200,
        joke: "Joke B",
      };
});

export const useJokeVoteAction = routeAction$((props) => {
  // eslint-disable-next-line no-console
  console.log("VOTE", props);
});

export default component$(() => {
  const isFavoriteSignal = useSignal(false);
  // Calling our `useDadJoke` hook, will return a reactive signal to the loaded data.
  const dadJokeSignal = useDadJoke();
  const favoriteJokeAction = useJokeVoteAction();
  useTask$(({ track }) => {
    track(() => isFavoriteSignal.value);
    // eslint-disable-next-line no-console
    console.log("FAVORITE (isomorphic)", isFavoriteSignal.value);
    server$(() => {
      // eslint-disable-next-line no-console
      console.log("FAVORITE (server)", isFavoriteSignal.value);
    })();
  });
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
      <button
        id="favorite-heart"
        onClick$={() => (isFavoriteSignal.value = !isFavoriteSignal.value)}
      >
        {isFavoriteSignal.value ? "❤️" : "🤍"}
      </button>
    </section>
  );
});
