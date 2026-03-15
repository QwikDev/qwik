import { component$, useAsync$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const query = useSignal('');

  // this will first run during SSR (server)
  // then re-run whenever postId changes (client)
  // so this code runs both on the server and the client
  const jokes = useAsync$(async ({ track, abortSignal }) => {
    const url = new URL(
      'https://v2.jokeapi.dev/joke/Programming?safe-mode&amount=2'
    );
    const search = track(query);
    if (search) {
      url.searchParams.set('contains', search);
    }

    // The abortSignal is automatically aborted when this function re-runs,
    // canceling any pending fetch requests.
    const resp = await fetch(url, { signal: abortSignal });
    const json = (await resp.json()) as {
      jokes: { setup?: string; delivery?: string; joke?: never }[];
    };

    return json.jokes;
  });

  return (
    <>
      <label>
        Query: <input bind:value={query} />
      </label>
      {jokes.loading ? (
        <p>Loading...</p>
      ) : jokes.error ? (
        <div>Error: {jokes.error.message}</div>
      ) : jokes.value ? (
        <ul>
          {jokes.value.map((joke, i) => (
            <li key={i}>
              <div style={{ whiteSpace: 'pre-wrap' }}>
                {joke.joke || `${joke.setup}\n${joke.delivery}`}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No jokes found</p>
      )}
    </>
  );
});
