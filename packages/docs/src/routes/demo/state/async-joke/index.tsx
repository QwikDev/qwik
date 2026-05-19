import { component$, useAsync$, useSignal } from '@qwik.dev/core';

type Joke = {
  joke?: string;
  setup?: string;
  delivery?: string;
};

export default component$(() => {
  const query = useSignal('');

  const jokes = useAsync$(async ({ track, abortSignal }) => {
    // Re-run when query changes.
    const search = track(query).trim();
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

  let content;
  if (jokes.loading) {
    content = <p>Loading...</p>;
  } else if (jokes.error) {
    content = <div>Error: {jokes.error.message}</div>;
  } else if (jokes.value.length === 0) {
    content = <p>No jokes found</p>;
  } else {
    content = (
      <ul>
        {jokes.value.map((joke, i) => (
          <li key={i}>
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {joke.joke ?? `${joke.setup}\n${joke.delivery}`}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <label>
        Query: <input bind:value={query} />
      </label>
      {content}
    </>
  );
});
