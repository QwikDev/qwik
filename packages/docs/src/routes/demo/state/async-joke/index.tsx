import {
  $,
  component$,
  Catch,
  Pending,
  useComputed$,
  useSignal,
  type Signal,
} from '@qwik.dev/core';

type Joke = {
  joke?: string;
  setup?: string;
  delivery?: string;
};

const JokeList = component$((props: { jokes: Signal<Joke[]> }) => {
  return props.jokes.value.length === 0 ? (
    <p>No jokes found</p>
  ) : (
    <ul>
      {props.jokes.value.map((joke, i) => (
        <li key={i}>
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {joke.joke ?? `${joke.setup}\n${joke.delivery}`}
          </div>
        </li>
      ))}
    </ul>
  );
});

export default component$(() => {
  const query = useSignal('');

  const jokes = useComputed$(async ({ abortSignal }) => {
    // Re-run when query.value changes.
    const search = query.value.trim();
    const url = new URL(
      'https://v2.jokeapi.dev/joke/Programming?safe-mode&amount=2'
    );

    if (search) {
      url.searchParams.set('contains', search);
    }

    const response = await fetch(url, { signal: abortSignal });
    const data = (await response.json()) as {
      jokes?: Joke[];
    };

    return data.jokes ?? [];
  });

  return (
    <>
      <label>
        Query: <input bind:value={query} />
      </label>
      <Catch
        fallback$={$((error, reset) => (
          <div>
            Error: {error.message}{' '}
            <button onClick$={() => reset()}>Retry</button>
          </div>
        ))}
      >
        <Pending fallback$={() => <p>Loading...</p>}>
          <JokeList jokes={jokes} />
        </Pending>
      </Catch>
    </>
  );
});
